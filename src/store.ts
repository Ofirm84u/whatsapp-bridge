/**
 * Message store — persists messages to a JSON file per contact.
 * Stored in AUTH_STATE_DIR/messages/<phone>.json
 */

import fs from "fs";
import path from "path";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const AUTH_DIR = process.env.AUTH_STATE_DIR || "./auth_state";
const MESSAGES_DIR = path.resolve(AUTH_DIR, "messages");

export interface StoredMessage {
  from: string;
  name: string;
  message: string;
  timestamp: number;
  direction: "incoming" | "outgoing";
}

// Ensure messages directory exists
function ensureDir(): void {
  if (!fs.existsSync(MESSAGES_DIR)) {
    fs.mkdirSync(MESSAGES_DIR, { recursive: true });
  }
}

function phoneToFile(phone: string): string {
  // Normalize: strip +, spaces, dashes
  const normalized = phone.replace(/[+\-\s()]/g, "");
  return path.join(MESSAGES_DIR, `${normalized}.json`);
}

function readMessages(phone: string): StoredMessage[] {
  const filePath = phoneToFile(phone);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as StoredMessage[];
  } catch {
    logger.warn({ phone }, "Failed to read message file, starting fresh");
    return [];
  }
}

function writeMessages(phone: string, messages: StoredMessage[]): void {
  ensureDir();
  const filePath = phoneToFile(phone);
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), "utf-8");
}

export function storeMessage(msg: StoredMessage): void {
  const phone = msg.from;
  const existing = readMessages(phone);
  existing.push(msg);
  writeMessages(phone, existing);
  logger.debug({ phone, direction: msg.direction }, "Message stored");
}

export function getMessages(phone: string, limit?: number): StoredMessage[] {
  const normalized = phone.replace(/[+\-\s()]/g, "");
  // Also try with 972 prefix if starts with 0
  const variants = [normalized];
  if (normalized.startsWith("0")) {
    variants.push("972" + normalized.slice(1));
  } else if (normalized.startsWith("972")) {
    variants.push("0" + normalized.slice(3));
  }

  let messages: StoredMessage[] = [];
  for (const variant of variants) {
    const msgs = readMessages(variant);
    if (msgs.length > messages.length) {
      messages = msgs;
    }
  }

  if (limit && limit > 0) {
    return messages.slice(-limit);
  }
  return messages;
}

export function getMessageCount(phone: string): number {
  return getMessages(phone).length;
}

export function listContacts(): Array<{ phone: string; messageCount: number; lastMessage: number }> {
  ensureDir();
  const files = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const phone = f.replace(".json", "");
    const messages = readMessages(phone);
    const lastMessage = messages.length > 0
      ? messages[messages.length - 1].timestamp
      : 0;
    return { phone, messageCount: messages.length, lastMessage };
  }).sort((a, b) => b.lastMessage - a.lastMessage);
}
