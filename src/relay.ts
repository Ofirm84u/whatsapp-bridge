/**
 * WebSocket relay — the Chrome extension connects here.
 * Handles bidirectional message passing between extension and HTTP API.
 */

import { WebSocketServer, WebSocket } from "ws";
import pino from "pino";
import { storeMessage } from "./store";
import { dispatchToWebhooks } from "./handlers/messages";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

let extensionSocket: WebSocket | null = null;
let pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (err: Error) => void }>();
let requestId = 0;

export function isExtensionConnected(): boolean {
  return extensionSocket !== null && extensionSocket.readyState === WebSocket.OPEN;
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    logger.info("Chrome extension connected");
    extensionSocket = ws;

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        handleExtensionMessage(data);
      } catch (e) {
        logger.error({ error: String(e) }, "Failed to parse extension message");
      }
    });

    ws.on("close", () => {
      logger.warn("Chrome extension disconnected");
      extensionSocket = null;
      // Reject all pending requests
      for (const [id, req] of pendingRequests) {
        req.reject(new Error("Extension disconnected"));
      }
      pendingRequests.clear();
    });

    ws.on("error", (err) => {
      logger.error({ error: String(err) }, "WebSocket error");
    });
  });
}

function handleExtensionMessage(data: any): void {
  // Response to a request we sent
  if (data.responseId && pendingRequests.has(data.responseId)) {
    const req = pendingRequests.get(data.responseId)!;
    pendingRequests.delete(data.responseId);
    if (data.error) {
      req.reject(new Error(data.error));
    } else {
      req.resolve(data.result);
    }
    return;
  }

  // Incoming message from WhatsApp (extension pushes these)
  if (data.type === "incoming_message") {
    const { from, name, message, timestamp } = data;
    logger.info({ from, name }, "Incoming message via extension");

    storeMessage({ from, name, message, timestamp, direction: "incoming" });
    dispatchToWebhooks({ from, name, message, timestamp });
    return;
  }

  logger.debug({ data }, "Unknown message from extension");
}

/**
 * Send a command to the extension and wait for a response.
 */
export function sendToExtension(action: string, payload: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isExtensionConnected()) {
      reject(new Error("Extension not connected"));
      return;
    }

    const id = `req_${++requestId}`;
    pendingRequests.set(id, { resolve, reject });

    extensionSocket!.send(JSON.stringify({ id, action, ...payload }));

    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error("Request timed out"));
      }
    }, 30_000);
  });
}
