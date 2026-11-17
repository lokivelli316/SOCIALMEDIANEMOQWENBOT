import { createHash } from "node:crypto";
const SECRET_KEY = /(access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret)/i;

export function redactSecretText(input: string): string {
  return input
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=:-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|authorization|password|secret)\s*["'=:\s]+)(["']?)[A-Za-z0-9._~+\/=:-]{6,}\2/gi,
      "$1[REDACTED]"
    );
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactSecrets(child);
    }
    return result;
  }
  return value;
}


export function boundedRedactedDetail(input: string, maxChars = 4096): string {
  const redacted = redactSecretText(input);
  if (redacted.length <= maxChars) return redacted;
  const digest = createHash("sha256").update(redacted).digest("hex");
  return `${redacted.slice(0, maxChars)}… [TRUNCATED sha256=${digest}]`;
}
