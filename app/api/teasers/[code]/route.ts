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
  | { domain: string; removedAt: string }; // ISO 8601

function historyPathForCountry(code: string) {
  // JSONL: 1 запись = 1 строка
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".jsonl");
}

function tagsPathForCountry(code: string) {
  // JSON: { "example.com": "nutra", ... }
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
    // tags опционально
    let tags: Record<string, string> = {};
    try {
      const tPath = tagsPathForCountry(code);
      const { text: tText } = await fetchRepoFile(tPath);
      const parsed = tText ? (JSON.parse(tText) as unknown) : {};
      if (parsed && typeof parsed === "object") tags = parsed as Record<string, string>;
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

/** PUT /api/teasers/[code] body: { add: string[], vertical?: string } → дописывает новые уникальные строки */
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

    const toAdd = (body.add as unknown[])
      .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
      .map((d) => d.trim());

    if (toAdd.length === 0) {
      return NextResponse.json({ error: "Список доменов для добавления пустой" }, { status: 400 });
    }

    const path = countryFilePath(resolveTeasersPrefix(), code);
    const { text, sha } = await fetchRepoFile(path);
    const existing = new Set(parseLines(text));
    const newOnes = toAdd.filter((d) => !existing.has(d));

    if (newOnes.length === 0) {
      return NextResponse.json({ ok: true, added: 0, total: existing.size, message: "Все домены уже есть в списке" });
    }

    const allLines = [...existing, ...newOnes];
    await putRepoFile(path, allLines.join("\n") + "\n", sha || undefined);

    // Теги вертикалей (JSON) — присваиваем вертикаль всем новым доменам
    try {
      const tPath = tagsPathForCountry(code);
      const { text: tText, sha: tSha } = await fetchRepoFile(tPath);
      const parsed = tText ? (JSON.parse(tText) as unknown) : {};
      const tags: Record<string, string> =
        parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};

      for (const d of newOnes) tags[d] = vertical;
      await putRepoFile(tPath, JSON.stringify(tags, null, 2) + "\n", tSha || undefined);
    } catch {
      // не блокируем добавление
    }

    // История добавлений (JSONL) — пишем только новые домены
    try {
      const hPath = historyPathForCountry(code);
      const { text: hText, sha: hSha } = await fetchRepoFile(hPath);
      const now = toIsoNow();
      const events: TeasersHistoryEvent[] = newOnes.map((domain) => ({ domain, addedAt: now }));
      const append = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await putRepoFile(hPath, (hText ?? "") + append, hSha || undefined);
    } catch {
      // История не критична для основного списка — не блокируем добавление
    }

    return NextResponse.json({ ok: true, added: newOnes.length, total: allLines.length });
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
      const parsed = tText ? (JSON.parse(tText) as unknown) : {};
      const tags: Record<string, string> =
        parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
      if (toRemove in tags) {
        delete tags[toRemove];
        await putRepoFile(tPath, JSON.stringify(tags, null, 2) + "\n", tSha || undefined);
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
