import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export interface IncomingMessage {
  from: string;
  name: string;
  message: string;
  timestamp: number;
}

const webhookUrls: Set<string> = new Set();

// Load initial webhook from env
const envWebhook = process.env.WEBHOOK_URL;
if (envWebhook) {
  webhookUrls.add(envWebhook);
}

export function addWebhook(url: string): void {
  webhookUrls.add(url);
  logger.info({ url }, "Webhook registered");
}

export function removeWebhook(url: string): boolean {
  const removed = webhookUrls.delete(url);
  if (removed) logger.info({ url }, "Webhook removed");
  return removed;
}

export function listWebhooks(): string[] {
  return Array.from(webhookUrls);
}

export async function dispatchToWebhooks(msg: IncomingMessage): Promise<void> {
  if (webhookUrls.size === 0) {
    logger.debug("No webhooks registered, skipping dispatch");
    return;
  }

  const body = JSON.stringify(msg);

  for (const url of webhookUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.warn({ url, status: response.status }, "Webhook returned non-OK");
      } else {
        logger.debug({ url }, "Webhook dispatched");
      }
    } catch (error) {
      logger.error({ url, error: String(error) }, "Webhook dispatch failed");
    }
  }
}
