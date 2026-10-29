import { LIMITS } from "./catalog";

/** Collapses whitespace and rejects control characters (GameNameValidator.swift). */
export function sanitizeGameName(value: string): string | null {
  const collapsed = value.split(/\s+/).filter(Boolean).join(" ");
  if (collapsed.length < 2 || collapsed.length > LIMITS.gameNameMax) return null;
  if (/[\u0000-\u001f\u007f]/.test(collapsed)) return null;
  return collapsed;
}

export function normalizeGameName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function uniqueGameNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const sanitized = sanitizeGameName(value);
    if (!sanitized) continue;
    const key = normalizeGameName(sanitized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sanitized);
  }
  return result;
}

/** Letters (any script), digits, underscore, dot and dash; 3–30 characters. */
export const USERNAME_PATTERN = /^[\p{L}\p{N}_.-]{3,30}$/u;

export function sanitizeUsername(value: string): string | null {
  const trimmed = value.trim().replace(/^@/, "");
  return USERNAME_PATTERN.test(trimmed) ? trimmed : null;
}

/** Builds a valid username suggestion from a platform display name. */
export function suggestUsername(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const cleaned = candidate
      .trim()
      .replace(/^@/, "")
      .replace(/\s+/g, "_")
      .replace(/[^\p{L}\p{N}_.-]/gu, "")
      .slice(0, LIMITS.usernameMax);
    if (cleaned.length >= LIMITS.usernameMin) return cleaned;
  }
  return null;
}
