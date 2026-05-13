import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import {
  getAdminPassword,
  resolveDomainsPrefix,
  resolvePassedDomainsPrefix,
  countryFilePath,
  countryJsonFilePath,
} from "@/lib/env";
import { normalizeDomainLine, parseDomainLines } from "@/lib/domainNormalize";
import { fetchRepoFile, putRepoFile } from "@/lib/github";

export const dynamic = "force-dynamic";

function normalizeCode(raw: string): string | null {
  const c = raw.toLowerCase().trim();
  if (!/^[a-z]{2}$/.test(c) || !isKnownCountryCode(c)) return null;
  return c;
}

function checkWriteAuth(request: NextRequest): NextResponse | null {
  const secret = getAdminPassword();
  if (!secret) return null;
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]?.trim() !== secret) {
    return NextResponse.json(
      { error: "Нужен пароль администратора (заголовок Authorization: Bearer)." },
      { status: 401 },
    );
  }
  return null;
}

function parsePassedMap(text: string): Record<string, string> {
  if (!text.trim()) return {};
  try {
    const o = JSON.parse(text) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && typeof k === "string" && k.trim()) {
        out[normalizeDomainLine(k)] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function passedFilePath(code: string) {
  return countryJsonFilePath(resolvePassedDomainsPrefix(), code);
}

/** GET → { entries: { domain, passedAt }[] } по убыванию passedAt */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const path = passedFilePath(code);
    const { text } = await fetchRepoFile(path);
    const map = parsePassedMap(text);
    const entries = Object.entries(map).map(([domain, passedAt]) => ({ domain, passedAt }));
    entries.sort((a, b) => (a.passedAt < b.passedAt ? 1 : a.passedAt > b.passedAt ? -1 : 0));

    return NextResponse.json({ code, entries, total: entries.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

/**
 * POST body: { mark: string[] } — домены из «новых» снимаются со списка и попадают в пройденные с текущей датой.
 * Ключ в JSON — нормализованный домен (как в domainNormalize).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const denied = checkWriteAuth(request);
  if (denied) return denied;

  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null || !("mark" in body)) {
      return NextResponse.json({ error: "Ожидается поле mark: string[]" }, { status: 400 });
    }

    const mark = (body as { mark: unknown }).mark;
    if (!Array.isArray(mark)) {
      return NextResponse.json({ error: "Поле mark должно быть массивом строк" }, { status: 400 });
    }

    const normMarks = new Set(
      mark
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => normalizeDomainLine(x)),
    );

    if (normMarks.size === 0) {
      return NextResponse.json({ error: "Список mark пустой" }, { status: 400 });
    }

    const domainsPath = countryFilePath(resolveDomainsPrefix(), code);
    const passedPath = passedFilePath(code);

    const { text: domainText, sha: domainSha } = await fetchRepoFile(domainsPath);
    const lines = parseDomainLines(domainText);

    const kept: string[] = [];
    const movedNorms = new Set<string>();
    for (const line of lines) {
      const n = normalizeDomainLine(line);
      if (normMarks.has(n)) movedNorms.add(n);
      else kept.push(line);
    }

    if (movedNorms.size === 0) {
      return NextResponse.json({
        ok: true,
        moved: 0,
        skippedNotInList: normMarks.size,
        message: "Ни один из отмеченных доменов не найден в текущем списке «Новые домены»",
      });
    }

    const { text: passedText, sha: passedSha } = await fetchRepoFile(passedPath);
    const passedMap = parsePassedMap(passedText);
    const now = new Date().toISOString();
    for (const n of movedNorms) {
      passedMap[n] = now;
    }

    const passedOut = JSON.stringify(passedMap, null, 2) + "\n";
    const domainOut = kept.length > 0 ? `${kept.join("\n")}\n` : "";

    await putRepoFile(passedPath, passedOut, passedSha || undefined);
    await putRepoFile(domainsPath, domainOut, domainSha || undefined);

    return NextResponse.json({
      ok: true,
      moved: movedNorms.size,
      skippedNotInList: normMarks.size - movedNorms.size,
      remainingNew: kept.length,
      passedTotal: Object.keys(passedMap).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка сохранения" },
      { status: 500 },
    );
  }
}
