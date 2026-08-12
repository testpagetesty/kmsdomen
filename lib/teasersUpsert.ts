import { isVerticalId } from "@/data/verticals";
import {
  resolveTeasersHistoryPrefix,
  resolveTeasersPrefix,
  countryFilePath,
} from "@/lib/env";
import { isPlausibleDomain, normalizeDomainLine } from "@/lib/domainNormalize";
import { fetchRepoFile, putRepoFile } from "@/lib/github";
import {
  parseTeaserTagsJson,
  serializeTeaserTags,
  type TeaserTagMeta,
} from "@/lib/teaserTags";

type HistoryEvent =
  | { domain: string; addedAt: string }
  | { domain: string; updatedAt: string; action: "update" };

function historyPathForCountry(code: string) {
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".jsonl");
}

function tagsPathForCountry(code: string) {
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".tags.json");
}

function parseLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Нормализует vertical: валидный id; "" / none / null → без вертикали */
export function resolveTeaserVertical(verticalRaw?: unknown): string {
  if (verticalRaw === undefined || verticalRaw === null) return "";
  if (typeof verticalRaw !== "string") return "";
  const v = verticalRaw.trim();
  if (!v || v === "none") return "";
  if (isVerticalId(v)) return v;
  return "";
}

export type UpsertTeasersResult = {
  added: string[];
  alreadyHad: string[];
  skippedInvalid: string[];
  total: number;
};

/**
 * Гарантирует наличие доменов в «Домены с тизерами».
 * Новые дописываются; уже есть — только обновляем updatedAt в meta/history.
 * vertical пустой = без вертикали (можно не указывать).
 */
export async function upsertTeasersForCountry(
  code: string,
  domains: string[],
  verticalRaw?: unknown,
): Promise<UpsertTeasersResult> {
  const vertical = resolveTeaserVertical(verticalRaw);
  const skippedInvalid: string[] = [];
  const norms: string[] = [];
  const seen = new Set<string>();
  for (const raw of domains) {
    const n = normalizeDomainLine(raw);
    if (!n || seen.has(n)) continue;
    if (!isPlausibleDomain(n)) {
      skippedInvalid.push(raw);
      continue;
    }
    seen.add(n);
    norms.push(n);
  }

  if (norms.length === 0) {
    return { added: [], alreadyHad: [], skippedInvalid, total: 0 };
  }

  const path = countryFilePath(resolveTeasersPrefix(), code);
  const { text, sha } = await fetchRepoFile(path);
  const lines = parseLines(text);

  const byNorm = new Map<string, string>();
  for (const line of lines) {
    byNorm.set(normalizeDomainLine(line), line);
  }

  const now = new Date().toISOString();
  const newOnes: string[] = [];
  const alreadyHad: string[] = [];

  for (const d of norms) {
    if (byNorm.has(d)) alreadyHad.push(d);
    else {
      newOnes.push(d);
      byNorm.set(d, d);
    }
  }

  if (newOnes.length > 0) {
    await putRepoFile(path, [...lines, ...newOnes].join("\n") + "\n", sha || undefined);
  }

  try {
    const tPath = tagsPathForCountry(code);
    const { text: tText, sha: tSha } = await fetchRepoFile(tPath);
    const tags = parseTeaserTagsJson(tText ?? "");

    for (const d of newOnes) {
      const meta: TeaserTagMeta = { addedAt: now, updatedAt: now };
      if (vertical) meta.vertical = vertical;
      tags[d] = meta;
    }
    for (const d of alreadyHad) {
      const fileKey = byNorm.get(d) ?? d;
      const prev = tags[fileKey] ?? tags[d];
      const meta: TeaserTagMeta = {
        addedAt: prev?.addedAt ?? now,
        updatedAt: now,
      };
      // вертикаль: если передали явно — ставим; иначе сохраняем прежнюю
      if (vertical) meta.vertical = vertical;
      else if (prev?.vertical) meta.vertical = prev.vertical;
      tags[fileKey] = meta;
    }

    if (newOnes.length > 0 || alreadyHad.length > 0) {
      await putRepoFile(tPath, serializeTeaserTags(tags), tSha || undefined);
    }
  } catch {
    // не блокируем основную запись списка
  }

  try {
    const hPath = historyPathForCountry(code);
    const { text: hText, sha: hSha } = await fetchRepoFile(hPath);
    const events: HistoryEvent[] = [
      ...newOnes.map((domain) => ({ domain, addedAt: now })),
      ...alreadyHad.map((domain) => ({ domain, updatedAt: now, action: "update" as const })),
    ];
    if (events.length > 0) {
      await putRepoFile(
        hPath,
        (hText ?? "") + events.map((e) => JSON.stringify(e)).join("\n") + "\n",
        hSha || undefined,
      );
    }
  } catch {
    // не блокируем
  }

  return {
    added: newOnes,
    alreadyHad,
    skippedInvalid,
    total: lines.length + newOnes.length,
  };
}
