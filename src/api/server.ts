import Fastify from "fastify";
import { registerRoutes } from "./routes";

export async function createServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
  });

  await registerRoutes(app);

  return app;
}

export async function startServer() {
  const app = await createServer();

  const port = parseInt(process.env.PORT || "3020", 10);
  const host = process.env.HOST || "0.0.0.0";

  await app.listen({ port, host });
  app.log.info({ port, host }, "API server listening");

  return app;
}
