import { FastifyInstance } from "fastify";
import { getStatus, getQRDataURL, getSocket } from "../client";
import { addWebhook, removeWebhook, listWebhooks } from "../handlers/messages";

interface SendBody {
  to: string;
  message: string;
}

interface WebhookBody {
  url: string;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health / connection status
  app.get("/status", async () => {
    return { status: getStatus() };
  });

  // QR code for pairing (base64 data URL)
  app.get("/qr", async (_req, reply) => {
    const qr = getQRDataURL();
    if (!qr) {
      return reply.status(404).send({ error: "No QR code available — already connected or not yet generated" });
    }
    return { qr };
  });

  // Send a text message
  app.post<{ Body: SendBody }>("/send", async (req, reply) => {
    const { to, message } = req.body;

    if (!to || !message) {
      return reply.status(400).send({ error: "Both 'to' and 'message' are required" });
    }

    const sock = getSocket();
    if (!sock) {
      return reply.status(503).send({ error: "WhatsApp not connected" });
    }

    // Normalize phone number: strip +, ensure @s.whatsapp.net
    const jid = to.replace(/\+/g, "").replace(/@s\.whatsapp\.net$/, "") + "@s.whatsapp.net";

    try {
      await sock.sendMessage(jid, { text: message });
      return { success: true, to: jid };
    } catch (error) {
      return reply.status(500).send({ error: `Failed to send: ${String(error)}` });
    }
  });

  // Register a webhook URL
  app.post<{ Body: WebhookBody }>("/webhooks", async (req, reply) => {
    const { url } = req.body;
    if (!url) {
      return reply.status(400).send({ error: "'url' is required" });
    }
    addWebhook(url);
    return { success: true, webhooks: listWebhooks() };
  });

  // List registered webhooks
  app.get("/webhooks", async () => {
    return { webhooks: listWebhooks() };
  });

  // Remove a webhook
  app.delete<{ Body: WebhookBody }>("/webhooks", async (req, reply) => {
    const { url } = req.body;
    if (!url) {
      return reply.status(400).send({ error: "'url' is required" });
    }
    const removed = removeWebhook(url);
    if (!removed) {
      return reply.status(404).send({ error: "Webhook not found" });
    }
    return { success: true, webhooks: listWebhooks() };
  });
}
