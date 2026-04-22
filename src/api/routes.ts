import fs from "fs";
import path from "path";
import { FastifyInstance } from "fastify";
import { isExtensionConnected, sendToExtension } from "../relay";
import { addWebhook, removeWebhook, listWebhooks } from "../handlers/messages";
import { storeMessage, getMessages, getMessageCount, listContacts } from "../store";

// Load admin HTML — works from both src/ (dev) and dist/ (prod)
const adminPath = path.join(__dirname, "..", "admin.html");
const adminPathAlt = path.join(__dirname, "..", "..", "src", "admin.html");
const ADMIN_HTML = fs.readFileSync(fs.existsSync(adminPath) ? adminPath : adminPathAlt, "utf-8");

interface SendBody {
  to: string;
  message: string;
}

interface WebhookBody {
  url: string;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Admin page
  app.get("/admin", async (_req, reply) => {
    reply.header("Content-Type", "text/html; charset=utf-8").send(ADMIN_HTML);
  });

  // Connection status
  app.get("/status", async () => {
    return { status: isExtensionConnected() ? "connected" : "disconnected" };
  });

  // Send a text message via the extension
  app.post<{ Body: SendBody }>("/send", async (req, reply) => {
    const { to, message } = req.body;

    if (!to || !message) {
      return reply.status(400).send({ error: "Both 'to' and 'message' are required" });
    }

    if (!isExtensionConnected()) {
      return reply.status(503).send({ error: "Chrome extension not connected — open WhatsApp Web" });
    }

    try {
      const result = await sendToExtension("send_message", { to, message });
      storeMessage({
        from: to.replace(/[+\-\s]/g, ""),
        name: "",
        message,
        timestamp: Math.floor(Date.now() / 1000),
        direction: "outgoing",
      });
      return { success: true, to, result };
    } catch (error) {
      return reply.status(500).send({ error: `Failed to send: ${String(error)}` });
    }
  });

  // Webhook management
  app.post<{ Body: WebhookBody }>("/webhooks", async (req, reply) => {
    const { url } = req.body;
    if (!url) return reply.status(400).send({ error: "'url' is required" });
    addWebhook(url);
    return { success: true, webhooks: listWebhooks() };
  });

  app.get("/webhooks", async () => {
    return { webhooks: listWebhooks() };
  });

  app.delete<{ Body: WebhookBody }>("/webhooks", async (req, reply) => {
    const { url } = req.body;
    if (!url) return reply.status(400).send({ error: "'url' is required" });
    const removed = removeWebhook(url);
    if (!removed) return reply.status(404).send({ error: "Webhook not found" });
    return { success: true, webhooks: listWebhooks() };
  });

  // Message history
  app.get("/contacts", async () => {
    return { contacts: listContacts() };
  });

  app.get<{ Params: { phone: string }; Querystring: { limit?: string } }>(
    "/messages/:phone",
    async (req) => {
      const { phone } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
      const messages = getMessages(phone, limit);
      return { phone, count: messages.length, total: getMessageCount(phone), messages };
    },
  );

  app.get<{ Params: { phone: string } }>("/messages/:phone/count", async (req) => {
    const { phone } = req.params;
    return { phone, count: getMessageCount(phone) };
  });
}
