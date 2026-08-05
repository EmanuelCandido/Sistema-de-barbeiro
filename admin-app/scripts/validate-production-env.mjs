import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "");
const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_APPCHECK_SITE_KEY",
];
const missing = required.filter((name) => !env[name]?.trim());

if (missing.length) throw new Error(`Build de produção bloqueado: configure ${missing.join(", ")}.`);
if (env.VITE_FIREBASE_PROJECT_ID !== "barbearia-c9246") throw new Error("Build de produção bloqueado: projeto Firebase inesperado.");
if (env.VITE_USE_FIREBASE_EMULATORS === "true") throw new Error("Build de produção bloqueado: emuladores estão habilitados.");
if (env.VITE_APPCHECK_DEBUG_TOKEN === "true") throw new Error("Build de produção bloqueado: App Check está em modo de depuração.");

console.log("Ambiente de produção validado.");
