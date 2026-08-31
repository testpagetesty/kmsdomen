import { normalizeDomainLine } from "@/lib/domainNormalize";

export type PassedSource = "new" | "teaser";

export type PassEvent = {
  passedAt: string;
  source: PassedSource;
};

/** Актуальная запись + полная история прохождений по дням */
export type PassedStored = {
  /** Последнее прохождение (для текущего состояния) */
  passedAt: string;
  source: PassedSource;
  /** Все прохождения; не перезаписываются при повторном проходе в другой день */
  passes: PassEvent[];
};

export type PassedEntry = {
  domain: string;
  passedAt: string;
  source: PassedSource;
};

export type PassedMap = Record<string, PassedStored>;

export function isPassedSource(v: unknown): v is PassedSource {
  return v === "new" || v === "teaser";
}

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

/** День UTC+3 для ISO-метки */
export function isoToDayKeyPlus3(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePasses(
  passedAt: string,
  source: PassedSource,
  rawPasses: unknown,
): PassEvent[] {
  const out: PassEvent[] = [];
  const seenDays = new Set<string>();

  if (Array.isArray(rawPasses)) {
    for (const item of rawPasses) {
      if (!item || typeof item !== "object") continue;
      const o = item as { passedAt?: unknown; source?: unknown };
      if (typeof o.passedAt !== "string" || !o.passedAt.trim()) continue;
      const day = isoToDayKeyPlus3(o.passedAt);
      if (!day || seenDays.has(day)) continue;
      seenDays.add(day);
      out.push({
        passedAt: o.passedAt,
        source: isPassedSource(o.source) ? o.source : source,
      });
    }
  }

  // legacy / нет passes — одна точка из passedAt
  if (out.length === 0 && passedAt) {
    out.push({ passedAt, source });
  }

  out.sort((a, b) => (a.passedAt < b.passedAt ? -1 : a.passedAt > b.passedAt ? 1 : 0));
  return out;
}

/**
 * Читает passed-domains JSON.
 * Legacy: { "domain.com": "ISO" } или { passedAt, source }
 * С историей: { passedAt, source, passes: [{ passedAt, source }, ...] }
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
        out[domain] = {
          passedAt: v,
          source: "new",
          passes: [{ passedAt: v, source: "new" }],
        };
        continue;
      }
      if (v && typeof v === "object") {
        const obj = v as { passedAt?: unknown; source?: unknown; passes?: unknown };
        const passedAt =
          typeof obj.passedAt === "string" && obj.passedAt.trim() ? obj.passedAt : null;
        if (!passedAt) continue;
        const source = isPassedSource(obj.source) ? obj.source : "new";
        const passes = normalizePasses(passedAt, source, obj.passes);
        const latest = passes[passes.length - 1] ?? { passedAt, source };
        out[domain] = {
          passedAt: latest.passedAt,
          source: latest.source,
          passes,
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
  const plain: Record<
    string,
    { passedAt: string; source: PassedSource; passes: PassEvent[] }
  > = {};
  for (const [domain, e] of Object.entries(map)) {
    plain[domain] = {
      passedAt: e.passedAt,
      source: e.source,
      passes: e.passes?.length
        ? e.passes
        : [{ passedAt: e.passedAt, source: e.source }],
    };
  }
  return JSON.stringify(plain, null, 2) + "\n";
}

/** Последнее состояние каждого домена (уникальные домены) */
export function passedMapToEntries(map: PassedMap): PassedEntry[] {
  const entries = Object.entries(map).map(([domain, e]) => ({
    domain,
    passedAt: e.passedAt,
    source: e.source,
  }));
  entries.sort((a, b) => (a.passedAt < b.passedAt ? 1 : a.passedAt > b.passedAt ? -1 : 0));
  return entries;
}

/**
 * Разворачивает историю: одна строка = одно прохождение в конкретный день.
 * Нужно для отчётов по датам без «съезда» при повторном проходе.
 */
export function passedMapToHistoryEntries(map: PassedMap): PassedEntry[] {
  const entries: PassedEntry[] = [];
  for (const [domain, e] of Object.entries(map)) {
    const passes =
      e.passes?.length > 0 ? e.passes : [{ passedAt: e.passedAt, source: e.source }];
    for (const p of passes) {
      entries.push({ domain, passedAt: p.passedAt, source: p.source });
    }
  }
  entries.sort((a, b) => (a.passedAt < b.passedAt ? 1 : a.passedAt > b.passedAt ? -1 : 0));
  return entries;
}

/**
 * Записать прохождение, сохранив историю прошлых дней.
 * В один календарный день (UTC+3) для домена — одна запись (первое время дня сохраняется).
 */
export function recordPass(
  map: PassedMap,
  domain: string,
  nowIso: string,
  source: PassedSource,
): void {
  const day = isoToDayKeyPlus3(nowIso);
  const existing = map[domain];

  if (!existing) {
    map[domain] = {
      passedAt: nowIso,
      source,
      passes: [{ passedAt: nowIso, source }],
    };
    return;
  }

  const passes = [...(existing.passes?.length ? existing.passes : [{ passedAt: existing.passedAt, source: existing.source }])];
  const idx = day ? passes.findIndex((p) => isoToDayKeyPlus3(p.passedAt) === day) : -1;

  if (idx < 0) {
    passes.push({ passedAt: nowIso, source });
  }
  // если уже есть проход в этот день — дату не трогаем (история дня цела)

  passes.sort((a, b) => (a.passedAt < b.passedAt ? -1 : a.passedAt > b.passedAt ? 1 : 0));
  const latest = passes[passes.length - 1]!;
  map[domain] = {
    passedAt: latest.passedAt,
    source: latest.source,
    passes,
  };
}

/** Уникальные домены с хотя бы одним проходом в [fromKey, toKey] (UTC+3 дни) */
export function countDomainsInDayRange(
  map: PassedMap,
  fromKey: string,
  toKey: string,
): { count: number; lastPassedAt: string } {
  let count = 0;
  let lastPassedAt = "";
  for (const e of Object.values(map)) {
    const passes =
      e.passes?.length > 0 ? e.passes : [{ passedAt: e.passedAt, source: e.source }];
    let hit = false;
    for (const p of passes) {
      const day = isoToDayKeyPlus3(p.passedAt);
      if (!day || day < fromKey || day > toKey) continue;
      hit = true;
      if (!lastPassedAt || p.passedAt > lastPassedAt) lastPassedAt = p.passedAt;
    }
    if (hit) count += 1;
  }
  return { count, lastPassedAt };
}
