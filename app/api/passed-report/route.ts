import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { COUNTRIES, getCountryByCode, isKnownCountryCode } from "@/data/countries";
import {
  resolveEmployeesPath,
  resolvePassedDomainsPrefix,
  countryJsonFilePath,
} from "@/lib/env";
import { parseEmployeesJson } from "@/lib/employees";
import { fetchRepoFile, listRepoDir } from "@/lib/github";
import { normalizeDomainLine } from "@/lib/domainNormalize";

export const dynamic = "force-dynamic";

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

function toYmdPlus3(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return toYmdPlus3(d);
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

type CountryActivity = {
  code: string;
  nameRu: string;
  count: number;
  lastPassedAt: string;
};

/**
 * GET /api/passed-report?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Сводка прохождений по сотрудникам и странам за период (UTC+3).
 * Отдельный путь — чтобы не пересекаться с /api/passed/[code].
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const today = toYmdPlus3(new Date());
    const from = url.searchParams.get("from") || today;
    const to = url.searchParams.get("to") || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "from/to должны быть YYYY-MM-DD" }, { status: 400 });
    }
    const fromKey = from <= to ? from : to;
    const toKey = from <= to ? to : from;

    const prefix = resolvePassedDomainsPrefix();
    const dirEntries = await listRepoDir(prefix || ".");
    const jsonFiles = dirEntries.filter(
      (e) => e.type === "file" && /^[a-z]{2}\.json$/i.test(e.name),
    );

    // fallback: если папки нет / пуста — пробежимся по известным кодам (медленно, но надёжно)
    const codes =
      jsonFiles.length > 0
        ? jsonFiles.map((f) => f.name.slice(0, 2).toLowerCase()).filter(isKnownCountryCode)
        : COUNTRIES.map((c) => c.code);

    const countryStats: CountryActivity[] = [];

    // батчами, чтобы не упереться в лимиты
    const BATCH = 12;
    for (let i = 0; i < codes.length; i += BATCH) {
      const chunk = codes.slice(i, i + BATCH);
      const results = await Promise.all(
        chunk.map(async (code) => {
          try {
            const path = countryJsonFilePath(prefix, code);
            const { text } = await fetchRepoFile(path);
            const map = parsePassedMap(text);
            let count = 0;
            let lastPassedAt = "";
            for (const iso of Object.values(map)) {
              const day = isoToDayKey(iso);
              if (!day || day < fromKey || day > toKey) continue;
              count += 1;
              if (!lastPassedAt || iso > lastPassedAt) lastPassedAt = iso;
            }
            if (count === 0) return null;
            const c = getCountryByCode(code);
            return {
              code,
              nameRu: c?.nameRu ?? code.toUpperCase(),
              count,
              lastPassedAt,
            } satisfies CountryActivity;
          } catch {
            return null;
          }
        }),
      );
      for (const r of results) {
        if (r) countryStats.push(r);
      }
    }

    // сотрудники
    let employeesData = { employees: [] as { id: string; name: string }[], assignments: {} as Record<string, string> };
    try {
      const { text } = await fetchRepoFile(resolveEmployeesPath());
      employeesData = parseEmployeesJson(text);
    } catch {
      // ignore
    }

    const byId = new Map(employeesData.employees.map((e) => [e.id, e.name]));
    type EmpBucket = {
      employeeId: string;
      name: string;
      countries: CountryActivity[];
      domainsTotal: number;
      countriesTotal: number;
    };

    const buckets = new Map<string, EmpBucket>();
    const unassigned: CountryActivity[] = [];

    for (const st of countryStats) {
      const empId = employeesData.assignments[st.code];
      if (empId && byId.has(empId)) {
        let b = buckets.get(empId);
        if (!b) {
          b = {
            employeeId: empId,
            name: byId.get(empId)!,
            countries: [],
            domainsTotal: 0,
            countriesTotal: 0,
          };
          buckets.set(empId, b);
        }
        b.countries.push(st);
        b.domainsTotal += st.count;
        b.countriesTotal += 1;
      } else {
        unassigned.push(st);
      }
    }

    const byEmployee = Array.from(buckets.values())
      .map((b) => ({
        ...b,
        countries: b.countries.sort((a, c) => c.count - a.count || a.nameRu.localeCompare(c.nameRu, "ru")),
      }))
      .sort(
        (a, b) =>
          b.countriesTotal - a.countriesTotal ||
          b.domainsTotal - a.domainsTotal ||
          a.name.localeCompare(b.name, "ru"),
      );

    unassigned.sort((a, b) => b.count - a.count || a.nameRu.localeCompare(b.nameRu, "ru"));

    const activeCountryCodes = [
      ...byEmployee.flatMap((e) => e.countries.map((c) => c.code)),
      ...unassigned.map((c) => c.code),
    ];

    return NextResponse.json({
      from: fromKey,
      to: toKey,
      byEmployee,
      unassigned,
      activeCountryCodes,
      totals: {
        employees: byEmployee.length,
        countries: countryStats.length,
        domains: countryStats.reduce((s, c) => s + c.count, 0),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка отчёта" },
      { status: 500 },
    );
  }
}
