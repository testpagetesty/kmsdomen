"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";

type CountryActivity = {
  code: string;
  nameRu: string;
  count: number;
  lastPassedAt: string;
};

type EmpBlock = {
  employeeId: string;
  name: string;
  countries: CountryActivity[];
  domainsTotal: number;
  countriesTotal: number;
};

type PriorityItem = {
  code: string;
  nameRu: string;
  employeeId: string | null;
  employeeName: string | null;
  done: boolean;
  count: number;
  lastPassedAt: string | null;
};

type Report = {
  from: string;
  to: string;
  byEmployee: EmpBlock[];
  unassigned: CountryActivity[];
  activeCountryCodes: string[];
  priority: PriorityItem[];
  prioritySummary: { total: number; done: number; missing: number };
  totals: { employees: number; countries: number; domains: number };
};

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

function dateToYmd(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const AVATAR_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h]!;
}

type Props = {
  /** Коды стран с активностью — для сортировки списка ниже */
  onActiveCodes?: (codes: string[]) => void;
};

export function PassedActivityReport({ onActiveCodes }: Props) {
  const [range, setRange] = useState<DateRange>(() => {
    const today = dateToYmd(new Date());
    return { from: today, to: today };
  });
  const [applied, setApplied] = useState<DateRange>(() => {
    const today = dateToYmd(new Date());
    return { from: today, to: today };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: r.from, to: r.to });
      const res = await fetch(`/api/passed-report?${qs}`, { cache: "no-store" });
      const data = (await res.json()) as Report & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setReport(data);
      onActiveCodes?.(data.activeCountryCodes ?? []);
    } catch (e) {
      setReport(null);
      onActiveCodes?.([]);
      setError(e instanceof Error ? e.message : "Ошибка загрузки отчёта");
    } finally {
      setLoading(false);
    }
  }, [onActiveCodes]);

  useEffect(() => {
    load(applied);
  }, [applied, load]);

  return (
    <div
      className="mb-6 rounded-xl border p-5"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Отчёт по прохождениям</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            История по дням сохраняется: повторный проход не стирает прошлые даты (UTC+3).
          </p>
        </div>
        {report && !loading && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {report.totals.employees} сотр. · {report.totals.countries} стран · {report.totals.domains} доменов
          </span>
        )}
      </div>

      <DateRangePicker
        value={range}
        onChange={(r) => {
          setRange(r);
          setApplied(r);
        }}
        label="Период (по умолчанию сегодня)"
        presets={["today", "yesterday", "thisWeek", "last7", "last30", "thisMonth"]}
      />

      {loading && (
        <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          Собираю прохождения по странам…
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm" style={{ color: "#f87171" }} role="alert">
          {error}
        </p>
      )}

      {!loading && report && (report.priority?.length ?? 0) > 0 && (
        <div
          className="mt-4 rounded-lg border p-3"
          style={{
            borderColor:
              report.prioritySummary.missing === 0 ? "rgba(52,211,153,.35)" : "rgba(251,191,36,.35)",
            background:
              report.prioritySummary.missing === 0 ? "rgba(52,211,153,.06)" : "rgba(251,191,36,.06)",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-white">Приоритетные страны</h4>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                Ежедневный контроль: проходили ли закреплённые страны за период
              </p>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
              style={{
                color: report.prioritySummary.missing === 0 ? "#34d399" : "#fbbf24",
                background:
                  report.prioritySummary.missing === 0
                    ? "rgba(52,211,153,.12)"
                    : "rgba(251,191,36,.12)",
              }}
            >
              {report.prioritySummary.done}/{report.prioritySummary.total} готово
              {report.prioritySummary.missing > 0
                ? ` · ${report.prioritySummary.missing} нет`
                : ""}
            </span>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...report.priority]
              .sort((a, b) => Number(a.done) - Number(b.done) || a.nameRu.localeCompare(b.nameRu, "ru"))
              .map((p) => (
                <li key={p.code}>
                  <Link
                    href={`/country/${p.code}?tab=passed`}
                    prefetch={false}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-white/[0.04]"
                    style={{
                      borderColor: p.done ? "rgba(52,211,153,.25)" : "rgba(248,113,113,.3)",
                      background: p.done ? "rgba(52,211,153,.06)" : "rgba(248,113,113,.06)",
                    }}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{
                            color: p.done ? "#34d399" : "#f87171",
                            background: p.done ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)",
                          }}
                          aria-hidden
                        >
                          {p.done ? "✓" : "!"}
                        </span>
                        <span className="truncate font-medium text-white">{p.nameRu}</span>
                        <span className="font-mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                          {p.code}
                        </span>
                      </span>
                      <span className="mt-0.5 block pl-7 text-[11px]" style={{ color: "var(--muted)" }}>
                        {p.employeeName ? p.employeeName : "без закрепления"}
                        {p.done ? ` · ${p.count} дом.` : " · нет прохождений"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      )}

      {!loading &&
        report &&
        report.byEmployee.length === 0 &&
        report.unassigned.length === 0 &&
        (report.priority?.length ?? 0) === 0 && (
        <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          За выбранный период прохождений нет
        </p>
      )}

      {!loading &&
        report &&
        report.byEmployee.length === 0 &&
        report.unassigned.length === 0 &&
        (report.priority?.length ?? 0) > 0 &&
        report.prioritySummary.done === 0 && (
        <p className="mt-3 text-center text-sm" style={{ color: "var(--muted)" }}>
          По приоритетным странам прохождений за период нет
        </p>
      )}

      {!loading && report && (report.byEmployee.length > 0 || report.unassigned.length > 0) && (
        <div className="mt-4 space-y-4">
          {report.byEmployee.map((emp) => {
            const color = colorForId(emp.employeeId);
            return (
              <div
                key={emp.employeeId}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.15)" }}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: color }}
                    >
                      {emp.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-white">{emp.name}</span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                    {emp.countriesTotal} стран · {emp.domainsTotal} доменов
                  </span>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {emp.countries.map((c) => (
                    <li key={c.code}>
                      <Link
                        href={`/country/${c.code}?tab=passed`}
                        prefetch={false}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:border-[var(--accent)] hover:bg-white/5"
                        style={{ borderColor: `${color}55`, background: `${color}14` }}
                      >
                        <span className="font-medium text-white">{c.nameRu}</span>
                        <span className="font-mono tabular-nums" style={{ color: "var(--muted)" }}>
                          {c.count}
                        </span>
                        <span className="font-mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                          {c.code}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {report.unassigned.length > 0 && (
            <div
              className="rounded-lg border p-3"
              style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.15)" }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-300">Без закрепления</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {report.unassigned.length} стран
                </span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {report.unassigned.map((c) => (
                  <li key={c.code}>
                    <Link
                      href={`/country/${c.code}?tab=passed`}
                      prefetch={false}
                      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs hover:bg-white/5"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="text-white">{c.nameRu}</span>
                      <span className="font-mono tabular-nums" style={{ color: "var(--muted)" }}>
                        {c.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
