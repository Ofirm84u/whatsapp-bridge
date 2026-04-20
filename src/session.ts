import { useMultiFileAuthState } from "baileys";
import path from "path";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const AUTH_DIR = process.env.AUTH_STATE_DIR || "./auth_state";

export async function loadAuthState() {
  const folder = path.resolve(AUTH_DIR);
  logger.info({ folder }, "Loading auth state");
  const { state, saveCreds } = await useMultiFileAuthState(folder);
  return { state, saveCreds };
}
