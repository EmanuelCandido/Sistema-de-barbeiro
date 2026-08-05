import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
const safeConfig = firebaseConfigured ? config : {
  apiKey: "firebase-not-configured",
  authDomain: "localhost",
  projectId: "barbearia-not-configured",
  appId: "1:0:web:not-configured",
};

export const app = initializeApp(safeConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence);

if (firebaseConfigured && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN === "true") window.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
if (firebaseConfigured && import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

if (firebaseConfigured && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

declare global { interface Window { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } }
