import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import { getAdminPassword, resolveDomainsPrefix, countryFilePath } from "@/lib/env";
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

export async function GET(_request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const path = countryFilePath(resolveDomainsPrefix(), code);
    const { text } = await fetchRepoFile(path);
    return NextResponse.json({ code, content: text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки с GitHub" },
      { status: 500 },
    );
  }
}

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

    if (typeof body !== "object" || body === null || !("content" in body)) {
      return NextResponse.json({ error: "Ожидается поле content (строка)" }, { status: 400 });
    }

    const content = (body as { content: unknown }).content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "Поле content должно быть строкой" }, { status: 400 });
    }

    if (content.length > 2_000_000) {
      return NextResponse.json({ error: "Слишком большой текст" }, { status: 413 });
    }

    const path = countryFilePath(resolveDomainsPrefix(), code);
    const { sha } = await fetchRepoFile(path);
    await putRepoFile(path, content, sha || undefined);
    return NextResponse.json({ ok: true, code });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка сохранения на GitHub" },
      { status: 500 },
    );
  }
}
