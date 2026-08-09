import { normalizeDomainLine } from "@/lib/domainNormalize";

export type PassedSource = "new" | "teaser";

export type PassedEntry = {
  domain: string;
  passedAt: string;
  source: PassedSource;
};

export type PassedMap = Record<string, { passedAt: string; source: PassedSource }>;

export function isPassedSource(v: unknown): v is PassedSource {
  return v === "new" || v === "teaser";
}

/**
 * Читает passed-domains JSON.
 * Legacy: { "domain.com": "ISO" } → source "new".
 * Новый: { "domain.com": { passedAt, source } }.
 */
export function parsePassedMap(text: string): PassedMap {
  if (!text.trim()) return {};
  try {
    const o = JSON.parse(text) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: PassedMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof k !== "string" || !k.trim()) continue;
      const domain = normalizeDomainLine(k);
      if (typeof v === "string" && v.trim()) {
        out[domain] = { passedAt: v, source: "new" };
        continue;
      }
      if (v && typeof v === "object") {
        const obj = v as { passedAt?: unknown; source?: unknown };
        const passedAt =
          typeof obj.passedAt === "string" && obj.passedAt.trim() ? obj.passedAt : null;
        if (!passedAt) continue;
        out[domain] = {
          passedAt,
          source: isPassedSource(obj.source) ? obj.source : "new",
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializePassedMap(map: PassedMap): string {
  const keys = Object.keys(map);
  if (keys.length === 0) return "";
  const plain: Record<string, { passedAt: string; source: PassedSource }> = {};
  for (const [domain, e] of Object.entries(map)) {
    plain[domain] = { passedAt: e.passedAt, source: e.source };
  }
  return JSON.stringify(plain, null, 2) + "\n";
}

export function passedMapToEntries(map: PassedMap): PassedEntry[] {
  const entries = Object.entries(map).map(([domain, e]) => ({
    domain,
    passedAt: e.passedAt,
    source: e.source,
  }));
  entries.sort((a, b) => (a.passedAt < b.passedAt ? 1 : a.passedAt > b.passedAt ? -1 : 0));
  return entries;
}
