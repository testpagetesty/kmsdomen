import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import { resolveTeasersHistoryPrefix, countryFilePath } from "@/lib/env";
import { fetchRepoFile } from "@/lib/github";

export const dynamic = "force-dynamic";

type Event = { domain: string; addedAt: string };

function normalizeCode(raw: string): string | null {
  const c = raw.toLowerCase().trim();
  if (!/^[a-z]{2}$/.test(c) || !isKnownCountryCode(c)) return null;
  return c;
}

function historyPathForCountry(code: string) {
  return countryFilePath(resolveTeasersHistoryPrefix(), code).replace(/\.txt$/i, ".jsonl");
}

function parseDateOnly(s: string | null): Date | null {
  if (!s) return null;
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function withinRange(iso: string, from: Date | null, to: Date | null): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to) {
    // включительно по дню: to + 1 day
    const end = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    if (d >= end) return false;
  }
  return true;
}

/**
 * GET /api/teasers/[code]/history?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Возвращает:
 * - events: [{domain, addedAt}]
 * - byDay: { "2026-05-11": 12, ... }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code: raw } = await ctx.params;
    const code = normalizeCode(raw ?? "");
    if (!code) return NextResponse.json({ error: "Неизвестный код страны" }, { status: 400 });

    const url = new URL(req.url);
    const from = parseDateOnly(url.searchParams.get("from"));
    const to = parseDateOnly(url.searchParams.get("to"));

    const path = historyPathForCountry(code);
    const { text } = await fetchRepoFile(path);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    const events: Event[] = [];
    const byDay: Record<string, number> = {};

    for (const line of lines) {
      try {
        const e = JSON.parse(line) as Partial<Event>;
        if (typeof e.domain !== "string" || typeof e.addedAt !== "string") continue;
        if (!withinRange(e.addedAt, from, to)) continue;
        events.push({ domain: e.domain, addedAt: e.addedAt });
        const key = toDateKey(e.addedAt);
        if (key) byDay[key] = (byDay[key] ?? 0) + 1;
      } catch {
        // ignore bad line
      }
    }

    // сортировка по времени (новые сверху)
    events.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0));

    return NextResponse.json({ code, events, total: events.length, byDay });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки истории" },
      { status: 500 },
    );
  }
}

