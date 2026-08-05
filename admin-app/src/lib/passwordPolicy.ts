export const MIN_PASSWORD_LENGTH = 6;

export type PasswordStrength = {
  level: 1 | 2 | 3;
  label: "Fraca" | "Média" | "Forte";
  message: string;
};

export function passwordPolicyError(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  return "";
}

export function passwordStrength(password: string): PasswordStrength {
  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
    .filter(pattern => pattern.test(password)).length;

  if (password.length < MIN_PASSWORD_LENGTH) {
    const missing = MIN_PASSWORD_LENGTH - password.length;
    return {
      level: 1,
      label: "Fraca",
      message: `Digite mais ${missing} ${missing === 1 ? "caractere" : "caracteres"}.`,
    };
  }
  if ((password.length >= 8 && variety === 4) || (password.length >= 10 && variety >= 3)) {
    return { level: 3, label: "Forte", message: "Boa combinação de tamanho e tipos de caractere." };
  }
  if (variety >= 2 || password.length >= 10) {
    return { level: 2, label: "Média", message: "Para fortalecer, misture letras, números e símbolos." };
  }
  return { level: 1, label: "Fraca", message: "Evite sequências simples e combine tipos de caractere." };
}
