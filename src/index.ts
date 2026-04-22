import { WebSocketServer } from "ws";
import pino from "pino";
import { startServer } from "./api/server";
import { setupWebSocket } from "./relay";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function main() {
  logger.info("Starting WhatsApp Bridge Relay...");

  // Start the HTTP API
  const app = await startServer();

  // Attach WebSocket server to the same port
  const wss = new WebSocketServer({ server: app.server });
  setupWebSocket(wss);

  logger.info("WebSocket relay ready — install the Chrome extension and open WhatsApp Web");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    wss.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.fatal({ error: String(error) }, "Fatal error");
  process.exit(1);
});
