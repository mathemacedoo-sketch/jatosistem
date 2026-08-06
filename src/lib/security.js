const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function sanitizeText(value, maxLength = 500) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEmail(value) {
  const email = sanitizeText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("E-mail inválido.");
  return email;
}

export function sanitizeRecord(value, depth = 0) {
  if (depth > 8) throw new Error("Estrutura de dados excede o limite permitido.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Valor numérico inválido.");
    return value;
  }
  if (typeof value === "string") return sanitizeText(value, 5000);
  if (Array.isArray(value)) {
    if (value.length > 1000) throw new Error("Quantidade de itens excede o limite permitido.");
    return value.map((item) => sanitizeRecord(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (DANGEROUS_KEYS.has(key)) throw new Error("Chave de objeto não permitida.");
      return [sanitizeText(key, 100), sanitizeRecord(item, depth + 1)];
    }));
  }
  throw new Error("Tipo de dado não permitido.");
}

export function assertStrongPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new Error("A senha deve ter entre 12 e 128 caracteres.");
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password)) {
    throw new Error("Use maiúscula, minúscula, número e caractere especial.");
  }
}

