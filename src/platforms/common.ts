import type { CreatorProfile, JsonValue, Platform, ReleaseManifest } from "../types.js";
import { boundedRedactedDetail, redactSecrets, redactSecretText } from "../core/redaction.js";
import { assertCredentialBinding } from "../core/credential-bindings.js";

export class HoldError extends Error {
  readonly name: string = "HoldError";
}

export class AmbiguousOutcomeError extends HoldError {
  readonly name: string = "AmbiguousOutcomeError";
}

const responseMeta = new WeakMap<Response, { timeoutMs: number; mutation: boolean }>();

function isMutationMethod(method: string | undefined): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
}

export function platformProfile(creator: CreatorProfile, platform: Platform) {
  const cfg = creator.platforms[platform];
  if (!cfg?.enabled) throw new HoldError(`${platform} is not enabled for creator ${creator.id}`);
  return cfg;
}

export function credential(creator: CreatorProfile, platform: Platform, key: string): string {
  const cfg = platformProfile(creator, platform);
  const envName = cfg.credentials[key];
  if (!envName) throw new HoldError(`${creator.id}/${platform} has no credential mapping for ${key}`);
  try {
    assertCredentialBinding(creator, platform, key, envName);
  } catch {
    throw new HoldError(`Credential reference is not operator-bound for ${creator.id}/${platform}/${key}`);
  }
  const value = process.env[envName];
  if (!value) throw new HoldError(`Missing configured credential for ${creator.id}/${platform}/${key}`);
  return value;
}

export function target(release: ReleaseManifest, platform: Platform): Record<string, JsonValue> {
  return release.targets?.[platform] ?? {};
}

export function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function boolValue(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function defaultString(
  creator: CreatorProfile,
  platform: Platform,
  key: string
): string | undefined {
  return stringValue(creator.platforms[platform]?.defaults?.[key]);
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = Number(process.env.NEMOQWEN_FETCH_TIMEOUT_MS ?? "30000"),
  remoteMutation = isMutationMethod(init.method)
): Promise<Response> {
  const bounded = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(Math.floor(timeoutMs), 300_000) : 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), bounded);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const mutation = remoteMutation;
  try {
    const response = await fetch(input, { ...init, signal });
    responseMeta.set(response, { timeoutMs: bounded, mutation });
    return response;
  } catch (error) {
    if (controller.signal.aborted) {
      const message = `Network timeout after ${bounded}ms; remote outcome may be unknown. Inspect receipts/platform state before retrying.`;
      if (mutation) throw new AmbiguousOutcomeError(message);
      throw new HoldError(message);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readBodyWithTimeout(response: Response): Promise<string> {
  const meta = responseMeta.get(response) ?? {
    timeoutMs: Number(process.env.NEMOQWEN_FETCH_TIMEOUT_MS ?? "30000"),
    mutation: false
  };
  const bounded = Number.isFinite(meta.timeoutMs) && meta.timeoutMs > 0
    ? Math.min(Math.floor(meta.timeoutMs), 300_000)
    : 30_000;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => undefined);
      const message = `Response body timeout after ${bounded}ms; remote outcome may be unknown. Inspect receipts/platform state before retrying.`;
      reject(meta.mutation ? new AmbiguousOutcomeError(message) : new HoldError(message));
    }, bounded);
  });

  const consume = (async () => {
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  })();

  try {
    return await Promise.race([consume, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readJsonResponse(response: Response): Promise<Record<string, any>> {
  const text = await readBodyWithTimeout(response);
  let body: Record<string, any>;
  try {
    body = text ? JSON.parse(text) as Record<string, any> : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const safeBody = redactSecrets(body) as Record<string, any>;
    const detail = typeof safeBody.error === "object"
      ? JSON.stringify(safeBody.error)
      : redactSecretText(text);
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      const suffix = retryAfter ? ` Retry-After: ${retryAfter}.` : "";
      throw new HoldError(`HTTP 429 rate limited.${suffix} Retry only after the platform window resets.`);
    }
    throw new Error(`HTTP ${response.status}: ${boundedRedactedDetail(detail || response.statusText)}`);
  }
  return body;
}

export function selectedAssets(release: ReleaseManifest, platform: Platform) {
  return (release.assets ?? []).filter(a => !a.platforms || a.platforms.includes(platform));
}
