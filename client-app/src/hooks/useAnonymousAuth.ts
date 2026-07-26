import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, authPersistenceReady, firebaseConfigured } from "../lib/firebase";

export function useAnonymousAuth() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!firebaseConfigured) {
      setError("Firebase não configurado. Crie client-app/.env.local usando o arquivo .env.example.");
      return undefined;
    }
    let unsubscribe: (() => void) | undefined;
    let active = true;
    authPersistenceReady.then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) return setReady(true);
        try { await signInAnonymously(auth); setReady(true); }
        catch { setError("Não foi possível iniciar uma sessão segura. Tente novamente."); }
      });
    }).catch(() => {
      if (active) setError("Este navegador bloqueou o armazenamento seguro do acesso ao agendamento.");
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  return { ready, error };
}
