import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import { getAdminPassword, resolveTeasersPrefix, countryFilePath } from "@/lib/env";
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
    return NextResponse.json({ code, lines, total: lines.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

/** PUT /api/teasers/[code] body: { add: string[] } → дописывает новые уникальные строки */
export async function PUT(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const denied = checkAuth(request);
  if (denied) return denied;

  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const body = (await request.json()) as { add?: unknown };
    if (!Array.isArray(body.add)) {
      return NextResponse.json({ error: "Ожидается поле add: string[]" }, { status: 400 });
    }

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
    return NextResponse.json({ ok: true, removed: toRemove, total: lines.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка удаления" },
      { status: 500 },
    );
  }
}
