import pino from "pino";
import { startClient, stopClient } from "./client";
import { startServer } from "./api/server";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function main() {
  logger.info("Starting WhatsApp Bridge...");

  // Start the REST API
  const app = await startServer();

  // Start the WhatsApp client (connects + shows QR)
  await startClient();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    await stopClient();
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
