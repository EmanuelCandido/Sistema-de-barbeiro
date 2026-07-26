import { readFileSync } from "node:fs";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (process.env.FIRESTORE_EMULATOR_HOST ? "barbearia-local" : undefined);
if (!projectId) throw new Error("Defina GCLOUD_PROJECT com o ID do projeto Firebase.");
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes("--confirm-production")) {
  throw new Error("Para gravar em produção, execute novamente com --confirm-production e credenciais ADC configuradas.");
}
const app = initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) });
const db = getFirestore(app);
const seed = JSON.parse(readFileSync(new URL("./seed-data.json", import.meta.url), "utf8"));
const batch = db.batch();
batch.set(db.doc("settings/public"), { ...seed["settings/public"], updatedAt:FieldValue.serverTimestamp() });
for (const { id, ...service } of seed.services) {
  batch.set(db.doc(`services/${id}`), { ...service, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() });
}
await batch.commit();
console.log(`Dados iniciais gravados em ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? " (Emulator)" : " (produção)"}.`);
