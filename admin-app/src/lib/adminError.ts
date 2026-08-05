import { FirebaseError } from "firebase/app";

export function adminMutationError(reason: unknown, fallback: string) {
  if (reason instanceof FirebaseError) {
    if (reason.code === "permission-denied") {
      return "O Firebase recusou esta alteração. Atualize a página e tente novamente; se continuar, revise as regras publicadas.";
    }
    if (reason.code === "unavailable" || reason.code === "network-request-failed") {
      return "Sem conexão com o Firebase. Verifique a internet e tente novamente.";
    }
    if (reason.code === "unauthenticated") return "Sua sessão expirou. Entre novamente no painel.";
    if (reason.code === "aborted") return "Os dados mudaram durante a alteração. Tente novamente.";
  }
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return fallback;
}
