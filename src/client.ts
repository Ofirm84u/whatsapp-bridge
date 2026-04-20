import makeWASocket, {
  DisconnectReason,
  WASocket,
  BaileysEventMap,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import * as QRCode from "qrcode";
import { loadAuthState } from "./session";
import { dispatchToWebhooks } from "./handlers/messages";
import { storeMessage } from "./store";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const MAX_RECONNECT_DELAY_MS = 60_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

type ConnectionStatus = "disconnected" | "qr-pending" | "connecting" | "connected";

let socket: WASocket | null = null;
let currentStatus: ConnectionStatus = "disconnected";
let currentQR: string | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function getStatus(): ConnectionStatus {
  return currentStatus;
}

export function getQRDataURL(): string | null {
  return currentQR;
}

export function getSocket(): WASocket | null {
  return socket;
}

export async function startClient(): Promise<void> {
  if (socket) {
    logger.warn("Client already running, skipping start");
    return;
  }
  await connect();
}

async function connect(): Promise<void> {
  const { state, saveCreds } = await loadAuthState();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }) as any,
    defaultQueryTimeoutMs: 60_000,
  });

  socket = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentStatus = "qr-pending";
      try {
        currentQR = await QRCode.toDataURL(qr);
      } catch {
        currentQR = null;
      }
      logger.info("QR code generated — scan with WhatsApp");
    }

    if (connection === "connecting") {
      currentStatus = "connecting";
    }

    if (connection === "open") {
      currentStatus = "connected";
      currentQR = null;
      reconnectAttempt = 0;
      logger.info("WhatsApp connected");
    }

    if (connection === "close") {
      socket = null;
      currentStatus = "disconnected";
      currentQR = null;

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        logger.warn("Logged out — delete auth_state and re-scan QR to reconnect");
        return;
      }

      // Exponential backoff reconnect
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt),
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectAttempt++;
      logger.info({ delay, attempt: reconnectAttempt }, "Reconnecting...");

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }
  });

  // Handle incoming messages — text only
  sock.ev.on("messages.upsert", (event: BaileysEventMap["messages.upsert"]) => {
    const { messages, type } = event;
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip our own messages
      if (msg.key.fromMe) continue;

      // Extract text — only plain text conversations
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        null;

      if (!text) {
        logger.debug({ from: msg.key.remoteJid }, "Non-text message ignored");
        continue;
      }

      const from = msg.key.remoteJid?.replace("@s.whatsapp.net", "") || "unknown";
      const name = msg.pushName || "";
      const timestamp = msg.messageTimestamp
        ? Number(msg.messageTimestamp)
        : Math.floor(Date.now() / 1000);

      logger.info({ from, name }, "Incoming text message");

      storeMessage({ from, name, message: text, timestamp, direction: "incoming" });
      dispatchToWebhooks({ from, name, message: text, timestamp });
    }
  });
}

export async function stopClient(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.end(undefined);
    socket = null;
  }
  currentStatus = "disconnected";
  currentQR = null;
  logger.info("Client stopped");
}
