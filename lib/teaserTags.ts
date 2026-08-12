/** Метаданные домена в разделе «Домены с тизерами» (teasers-meta/*.tags.json) */
export type TeaserTagMeta = {
  /** Вертикаль; пустая строка / отсутствует = без вертикали */
  vertical?: string;
  /** ISO 8601 — первая фиксация в списке */
  addedAt?: string;
  /** ISO 8601 — последнее изменение (вертикаль и т.п.) */
  updatedAt?: string;
};

/** Читает tags.json: поддержка старого формата `"domain": "nutra"` */
export function parseTeaserTagsJson(text: string): Record<string, TeaserTagMeta> {
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const out: Record<string, TeaserTagMeta> = {};
  for (const [domain, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") {
      out[domain] = { vertical: v };
      continue;
    }
    if (v && typeof v === "object") {
      const o = v as { vertical?: unknown; addedAt?: unknown; updatedAt?: unknown };
      const vertical =
        typeof o.vertical === "string" ? o.vertical : undefined;
      out[domain] = {
        ...(vertical !== undefined ? { vertical } : {}),
        addedAt: typeof o.addedAt === "string" ? o.addedAt : undefined,
        updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
      };
    }
  }
  return out;
}

export function serializeTeaserTags(tags: Record<string, TeaserTagMeta>): string {
  return JSON.stringify(tags, null, 2) + "\n";
}

export function teaserVerticalLabel(vertical: string | undefined): string {
  if (!vertical || vertical === "none" || vertical === "") return "Без вертикали";
  return vertical;
}
