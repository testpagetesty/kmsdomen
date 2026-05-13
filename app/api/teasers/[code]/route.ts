import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import { isVerticalId } from "@/data/verticals";
import {
  getAdminPassword,
  resolveTeasersPrefix,
  resolveTeasersHistoryPrefix,
  countryFilePath,
} from "@/lib/env";
import { fetchRepoFile, putRepoFile } from "@/lib/github";
import {
  parseTeaserTagsJson,
  serializeTeaserTags,
  type TeaserTagMeta,
} from "@/lib/teaserTags";

export const dynamic = "force-dynamic";

function normalizeCode(raw: string): string | null {
  const c = raw.toLowerCase().trim();
  if (!/^[a-z]{2}$/.test(c) || !isKnownCountryCode(c)) return null;
  return c;
}

function parseLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

type TeasersHistoryEvent =
  | { domain: string; addedAt: string } // ISO 8601
  | { domain: string; removedAt: string } // ISO 8601
  | { domain: string; updatedAt: string; action: "update" }; // ISO 8601

function historyPathForCountry(code: string) {
  // JSONL: 1 запись = 1 строка
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".jsonl");
}

function tagsPathForCountry(code: string) {
  // JSON: { "example.com": { vertical, addedAt?, updatedAt? } } или legacy string
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".tags.json");
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function checkAuth(request: NextRequest): NextResponse | null {
  const secret = getAdminPassword();
  if (!secret) return null;
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]?.trim() !== secret) {
    return NextResponse.json({ error: "Нужен пароль администратора" }, { status: 401 });
  }
  return null;
}

/** GET /api/teasers/[code] → { code, lines: string[], total: number } */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const path = countryFilePath(resolveTeasersPrefix(), code);
    const { text } = await fetchRepoFile(path);
    const lines = parseLines(text);
    let tags: Record<string, TeaserTagMeta> = {};
    try {
      const tPath = tagsPathForCountry(code);
      const { text: tText } = await fetchRepoFile(tPath);
      tags = parseTeaserTagsJson(tText ?? "");
    } catch {
      tags = {};
    }
    return NextResponse.json({ code, lines, total: lines.length, tags });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

/** PUT /api/teasers/[code] body: { add: string[], vertical?: string } — новые домены дописываются; уже в списке — обновляются вертикаль и updatedAt */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const denied = checkAuth(request);
  if (denied) return denied;

  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const body = (await request.json()) as { add?: unknown; vertical?: unknown };
    if (!Array.isArray(body.add)) {
      return NextResponse.json({ error: "Ожидается поле add: string[]" }, { status: 400 });
    }
    const vertical = isVerticalId(body.vertical) ? body.vertical : "other";

    const toAdd = [
      ...new Set(
        (body.add as unknown[])
          .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
          .map((d) => d.trim()),
      ),
    ];

    if (toAdd.length === 0) {
      return NextResponse.json({ error: "Список доменов для добавления пустой" }, { status: 400 });
    }

    const path = countryFilePath(resolveTeasersPrefix(), code);
    const { text, sha } = await fetchRepoFile(path);
    const existing = new Set(parseLines(text));
    const now = toIsoNow();

    const newOnes: string[] = [];
    const updated: string[] = [];
    let tags: Record<string, TeaserTagMeta> = {};
    try {
      const tPath = tagsPathForCountry(code);
      const { text: tText } = await fetchRepoFile(tPath);
      tags = parseTeaserTagsJson(tText ?? "");
    } catch {
      tags = {};
    }

    const touched: Record<string, TeaserTagMeta> = {};
    for (const d of toAdd) {
      if (!existing.has(d)) {
        newOnes.push(d);
        touched[d] = { vertical, addedAt: now, updatedAt: now };
      } else {
        updated.push(d);
        const prev = tags[d];
        touched[d] = {
          vertical,
          ...(prev?.addedAt ? { addedAt: prev.addedAt } : {}),
          updatedAt: now,
        };
      }
    }

    if (newOnes.length > 0) {
      const allLines = [...existing, ...newOnes];
      await putRepoFile(path, allLines.join("\n") + "\n", sha || undefined);
    }

    if (newOnes.length > 0 || updated.length > 0) {
      try {
        const tPath = tagsPathForCountry(code);
        const { text: tText, sha: tSha } = await fetchRepoFile(tPath);
        const onDisk = parseTeaserTagsJson(tText ?? "");
        for (const d of toAdd) {
          if (touched[d]) onDisk[d] = touched[d];
        }
        await putRepoFile(tPath, serializeTeaserTags(onDisk), tSha || undefined);
      } catch {
        // не блокируем
      }
    }

    // История (JSONL): новые — addedAt; существующие — update
    try {
      const hPath = historyPathForCountry(code);
      const { text: hText, sha: hSha } = await fetchRepoFile(hPath);
      const addEvents: TeasersHistoryEvent[] = newOnes.map((domain) => ({ domain, addedAt: now }));
      const updEvents: TeasersHistoryEvent[] = updated.map((domain) => ({
        domain,
        updatedAt: now,
        action: "update" as const,
      }));
      const append = [...addEvents, ...updEvents].map((e) => JSON.stringify(e)).join("\n") + "\n";
      if (newOnes.length + updated.length > 0) {
        await putRepoFile(hPath, (hText ?? "") + append, hSha || undefined);
      }
    } catch {
      // не блокируем
    }

    const totalLines = newOnes.length > 0 ? existing.size + newOnes.length : existing.size;

    return NextResponse.json({
      ok: true,
      added: newOnes.length,
      updated: updated.length,
      total: totalLines,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка сохранения" },
      { status: 500 },
    );
  }
}

/** DELETE /api/teasers/[code] body: { domain: string } → удаляет одну строку */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const denied = checkAuth(request);
  if (denied) return denied;

  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const body = (await request.json()) as { domain?: unknown };
    if (typeof body.domain !== "string" || !body.domain.trim()) {
      return NextResponse.json({ error: "Ожидается поле domain: string" }, { status: 400 });
    }

    const toRemove = body.domain.trim();
    const path = countryFilePath(resolveTeasersPrefix(), code);
    const { text, sha } = await fetchRepoFile(path);
    const lines = parseLines(text).filter((l) => l !== toRemove);

    await putRepoFile(path, lines.length > 0 ? lines.join("\n") + "\n" : "", sha || undefined);

    // Удаляем тег домена, если есть
    try {
      const tPath = tagsPathForCountry(code);
      const { text: tText, sha: tSha } = await fetchRepoFile(tPath);
      const tags = parseTeaserTagsJson(tText ?? "");
      if (toRemove in tags) {
        delete tags[toRemove];
        await putRepoFile(tPath, serializeTeaserTags(tags), tSha || undefined);
      }
    } catch {
      // не блокируем удаление
    }

    // История удалений (JSONL) — для корректных счетчиков по датам
    try {
      const hPath = historyPathForCountry(code);
      const { text: hText, sha: hSha } = await fetchRepoFile(hPath);
      const now = toIsoNow();
      const event: TeasersHistoryEvent = { domain: toRemove, removedAt: now };
      await putRepoFile(hPath, (hText ?? "") + JSON.stringify(event) + "\n", hSha || undefined);
    } catch {
      // не блокируем удаление
    }

    return NextResponse.json({ ok: true, removed: toRemove, total: lines.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка удаления" },
      { status: 500 },
    );
  }
}
