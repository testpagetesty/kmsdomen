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
import { isPlausibleDomain, normalizeDomainLine, parseDomainLines } from "@/lib/domainNormalize";
import { fetchRepoFile, putRepoFile } from "@/lib/github";
import {
  isPassedSource,
  parsePassedMap,
  passedMapToHistoryEntries,
  recordPass,
  serializePassedMap,
  type PassedSource,
} from "@/lib/passedDomains";
import { resolveTeaserVertical, upsertTeasersForCountry } from "@/lib/teasersUpsert";

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

function passedFilePath(code: string) {
  return countryJsonFilePath(resolvePassedDomainsPrefix(), code);
}

/** GET → { entries: история прохождений по дням, uniqueDomains } */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const path = passedFilePath(code);
    const { text } = await fetchRepoFile(path);
    const map = parsePassedMap(text);
    const entries = passedMapToHistoryEntries(map);

    return NextResponse.json({
      code,
      entries,
      total: entries.length,
      uniqueDomains: Object.keys(map).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

/**
 * POST — добавить домен(ы) в «пройденные» (веб-UI и Android).
 *
 * Body:
 *   { "domain": "example.com" } | { "mark": ["a.com"] }
 *   optional: { "source": "new" | "teaser" }  (по умолчанию "new")
 *   optional при source=teaser: { "vertical": "nutra" | ... | "none" }  (можно не слать — без вертикали)
 *
 * source "new"  — записать в passed и убрать из countries/{code}.txt
 * source "teaser" — записать в passed + добавить в «Домены с тизерами» (если ещё нет);
 *                   если домен был в «новых» — убрать оттуда
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

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Ожидается JSON: { domain: string } или { mark: string[] }" },
        { status: 400 },
      );
    }

    const b = body as {
      domain?: unknown;
      mark?: unknown;
      source?: unknown;
      vertical?: unknown;
    };
    const source: PassedSource = isPassedSource(b.source) ? b.source : "new";
    const vertical = resolveTeaserVertical(b.vertical);

    const rawList: string[] = [];
    if (typeof b.domain === "string" && b.domain.trim()) {
      rawList.push(b.domain.trim());
    }
    if (Array.isArray(b.mark)) {
      for (const x of b.mark) {
        if (typeof x === "string" && x.trim()) rawList.push(x.trim());
      }
    }

    const skippedInvalid = rawList.filter((d) => !isPlausibleDomain(d));
    const normMarks = [...new Set(rawList.map(normalizeDomainLine).filter(isPlausibleDomain))];
    if (normMarks.length === 0) {
      return NextResponse.json(
        {
          error:
            skippedInvalid.length > 0
              ? "В domain/mark нет валидных доменов (похоже, передан JSON ответа API вместо hostname)"
              : "Укажите domain (строка) или mark (массив строк)",
          skippedInvalid,
        },
        { status: 400 },
      );
    }

    const passedPath = passedFilePath(code);
    const { text: passedText, sha: passedSha } = await fetchRepoFile(passedPath);
    const passedMap = parsePassedMap(passedText);
    const now = new Date().toISOString();
    for (const n of normMarks) {
      recordPass(passedMap, n, now, source);
    }

    await putRepoFile(passedPath, serializePassedMap(passedMap), passedSha || undefined);

    let removedFromNew = 0;
    let remainingNew: number | undefined;
    let teasersAdded: string[] = [];
    let teasersAlreadyHad: string[] = [];
    let teasersTotal: number | undefined;

    // source=teaser → дописать в базу «Домены с тизерами» (vertical необязателен)
    if (source === "teaser") {
      const upsert = await upsertTeasersForCountry(code, normMarks, vertical || "none");
      teasersAdded = upsert.added;
      teasersAlreadyHad = upsert.alreadyHad;
      teasersTotal = upsert.total;
    }

    // Убрать из «новых»: всегда при source=new; при teaser — если домен там был
    if (source === "new" || source === "teaser") {
      const domainsPath = countryFilePath(resolveDomainsPrefix(), code);
      const { text: domainText, sha: domainSha } = await fetchRepoFile(domainsPath);
      const lines = parseDomainLines(domainText);
      const markSet = new Set(normMarks);
      const kept: string[] = [];
      const removed: string[] = [];
      for (const line of lines) {
        const n = normalizeDomainLine(line);
        if (markSet.has(n)) removed.push(n);
        else kept.push(line);
      }
      removedFromNew = removed.length;
      remainingNew = kept.length;
      if (removed.length > 0) {
        const domainOut = kept.length > 0 ? `${kept.join("\n")}\n` : "";
        await putRepoFile(domainsPath, domainOut, domainSha || undefined);
      }
    }

    const primary = normMarks[0];
    return NextResponse.json({
      ok: true,
      code,
      domain: primary,
      domains: normMarks,
      source,
      vertical: vertical || null,
      passedAt: now,
      removedFromNew,
      alreadyOnlyInPassed: source === "new" ? normMarks.length - removedFromNew : 0,
      remainingNew,
      passedTotal: Object.keys(passedMap).length,
      teasersAdded: teasersAdded.length,
      teasersAlreadyHad: teasersAlreadyHad.length,
      teasersTotal,
      addedToTeasersList: teasersAdded,
      skippedInvalid: skippedInvalid.length > 0 ? skippedInvalid : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка сохранения" },
      { status: 500 },
    );
  }
}

/**
 * PUT — убрать из «пройденных».
 * source "new" → вернуть в «новые»; source "teaser" → только удалить из passed (тизеры уже на месте).
 * Body: { restore: string[] } или { domain: string }
 */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
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

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Ожидается JSON: { restore: string[] } или { domain: string }" },
        { status: 400 },
      );
    }

    const b = body as { domain?: unknown; restore?: unknown };
    const rawList: string[] = [];
    if (typeof b.domain === "string" && b.domain.trim()) {
      rawList.push(b.domain.trim());
    }
    if (Array.isArray(b.restore)) {
      for (const x of b.restore) {
        if (typeof x === "string" && x.trim()) rawList.push(x.trim());
      }
    }

    const toRestore = [...new Set(rawList.map(normalizeDomainLine))];
    if (toRestore.length === 0) {
      return NextResponse.json(
        { error: "Укажите domain (строка) или restore (массив строк)" },
        { status: 400 },
      );
    }

    const domainsPath = countryFilePath(resolveDomainsPrefix(), code);
    const passedPath = passedFilePath(code);

    const { text: passedText, sha: passedSha } = await fetchRepoFile(passedPath);
    const passedMap = parsePassedMap(passedText);

    const restoredNew: string[] = [];
    const restoredTeaser: string[] = [];
    const missing: string[] = [];
    for (const d of toRestore) {
      const entry = passedMap[d];
      if (!entry) {
        missing.push(d);
        continue;
      }
      delete passedMap[d];
      if (entry.source === "teaser") restoredTeaser.push(d);
      else restoredNew.push(d);
    }

    if (restoredNew.length === 0 && restoredTeaser.length === 0) {
      return NextResponse.json({
        ok: true,
        restored: 0,
        missing: missing.length,
        message: "Ни один из доменов не найден в пройденных",
      });
    }

    let appendedToNew = 0;
    let remainingNew: number | undefined;

    if (restoredNew.length > 0) {
      const { text: domainText, sha: domainSha } = await fetchRepoFile(domainsPath);
      const existingLines = parseDomainLines(domainText);
      const existingNorm = new Set(existingLines.map(normalizeDomainLine));
      for (const d of restoredNew) {
        if (!existingNorm.has(d)) {
          existingLines.push(d);
          existingNorm.add(d);
          appendedToNew += 1;
        }
      }
      remainingNew = existingLines.length;
      const domainOut = existingLines.length > 0 ? `${existingLines.join("\n")}\n` : "";
      await putRepoFile(domainsPath, domainOut, domainSha || undefined);
    }

    await putRepoFile(passedPath, serializePassedMap(passedMap), passedSha || undefined);

    const restored = restoredNew.length + restoredTeaser.length;
    return NextResponse.json({
      ok: true,
      code,
      restored,
      restoredNew: restoredNew.length,
      restoredTeaser: restoredTeaser.length,
      appendedToNew,
      alreadyInNew: restoredNew.length - appendedToNew,
      missing: missing.length,
      remainingPassed: Object.keys(passedMap).length,
      remainingNew,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка возврата" },
      { status: 500 },
    );
  }
}

/**
 * DELETE — удалить из пройденных насовсем (без возврата в «новые», тизеры не трогаем).
 * Body: { domains: string[] } | { domain: string } | { remove: string[] }
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
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

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Ожидается JSON: { domain } | { domains: [] } | { remove: [] }" },
        { status: 400 },
      );
    }

    const b = body as { domain?: unknown; domains?: unknown; remove?: unknown };
    const rawList: string[] = [];
    if (typeof b.domain === "string" && b.domain.trim()) rawList.push(b.domain.trim());
    for (const key of ["domains", "remove"] as const) {
      const arr = b[key];
      if (Array.isArray(arr)) {
        for (const x of arr) {
          if (typeof x === "string" && x.trim()) rawList.push(x.trim());
        }
      }
    }

    const toRemove = [...new Set(rawList.map(normalizeDomainLine).filter(Boolean))];
    if (toRemove.length === 0) {
      return NextResponse.json({ error: "Укажите domain или domains/remove" }, { status: 400 });
    }

    const passedPath = passedFilePath(code);
    const { text: passedText, sha: passedSha } = await fetchRepoFile(passedPath);
    const passedMap = parsePassedMap(passedText);

    const removed: string[] = [];
    const missing: string[] = [];
    for (const d of toRemove) {
      if (d in passedMap) {
        delete passedMap[d];
        removed.push(d);
      } else {
        missing.push(d);
      }
    }

    if (removed.length > 0) {
      await putRepoFile(passedPath, serializePassedMap(passedMap), passedSha || undefined);
    }

    return NextResponse.json({
      ok: true,
      code,
      removed: removed.length,
      missing: missing.length,
      remainingPassed: Object.keys(passedMap).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка удаления" },
      { status: 500 },
    );
  }
}
