import Fastify from "fastify";
import pino from "pino";
import { registerRoutes } from "./routes";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export async function createServer() {
  const app = Fastify({
    logger: logger as any,
  });

  await registerRoutes(app);

  return app;
}

export async function startServer() {
  const app = await createServer();

  const port = parseInt(process.env.PORT || "3020", 10);
  const host = process.env.HOST || "0.0.0.0";

  await app.listen({ port, host });
  logger.info({ port, host }, "API server listening");

  return app;
}
