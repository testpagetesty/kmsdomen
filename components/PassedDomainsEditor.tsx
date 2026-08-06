"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";

type Props = { countryCode: string };

type Entry = { domain: string; passedAt: string };

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Меньше этого — красная подсветка «слишком быстро» */
const FAST_THRESHOLD_MS = 3 * 60 * 1000;
/** Больше этого между отметками — считаем началом новой сессии (не время на домен) */
const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

function dateToYmd(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateToYmd(d);
}

function formatIsoPlus3(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}ч ${String(m).padStart(2, "0")}м ${String(s).padStart(2, "0")}с`;
  return `${m}м ${String(s).padStart(2, "0")}с`;
}

/** Интервал от предыдущей отметки в хронологическом порядке; null = начало сессии */
function durationMapFor(entries: Entry[]): Map<string, number | null> {
  const chrono = [...entries].sort((a, b) =>
    a.passedAt < b.passedAt ? -1 : a.passedAt > b.passedAt ? 1 : 0,
  );
  const map = new Map<string, number | null>();
  for (let i = 0; i < chrono.length; i++) {
    const cur = chrono[i];
    if (i === 0) {
      map.set(cur.domain, null);
      continue;
    }
    const prev = chrono[i - 1];
    const tCur = new Date(cur.passedAt).getTime();
    const tPrev = new Date(prev.passedAt).getTime();
    if (Number.isNaN(tCur) || Number.isNaN(tPrev)) {
      map.set(cur.domain, null);
      continue;
    }
    const delta = tCur - tPrev;
    map.set(cur.domain, delta > 0 && delta <= SESSION_GAP_MS ? delta : null);
  }
  return map;
}

function inDateRange(iso: string, from: string, to: string): boolean {
  const day = isoToDayKey(iso);
  if (!day) return false;
  return day >= from && day <= to;
}

export function PassedDomainsEditor({ countryCode }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [password, setPassword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [range, setRange] = useState<DateRange>(() => {
    const today = dateToYmd(new Date());
    return { from: today, to: today };
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/passed/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setEntries(data.entries ?? []);
      setSelected(new Set());
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка загрузки" });
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  useEffect(() => {
    load();
  }, [load]);

  const durations = useMemo(() => durationMapFor(entries), [entries]);

  const inPeriod = useMemo(
    () => entries.filter((e) => inDateRange(e.passedAt, range.from, range.to)),
    [entries, range.from, range.to],
  );

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return inPeriod;
    return inPeriod.filter((e) => e.domain.toLowerCase().includes(q));
  }, [inPeriod, filterQuery]);

  const report = useMemo(() => {
    let fast = 0;
    let timed = 0;
    let sumMs = 0;
    const byDay = new Map<string, { count: number; fast: number }>();

    for (const e of inPeriod) {
      const day = isoToDayKey(e.passedAt) ?? "—";
      const cur = byDay.get(day) ?? { count: 0, fast: 0 };
      cur.count += 1;

      const dur = durations.get(e.domain);
      if (typeof dur === "number") {
        timed += 1;
        sumMs += dur;
        if (dur < FAST_THRESHOLD_MS) {
          fast += 1;
          cur.fast += 1;
        }
      }
      byDay.set(day, cur);
    }

    return {
      total: inPeriod.length,
      fast,
      timed,
      avgMs: timed > 0 ? Math.round(sumMs / timed) : null,
      byDay: Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    };
  }, [inPeriod, durations]);

  const filteredDomains = useMemo(() => filtered.map((e) => e.domain), [filtered]);
  const allFilteredSelected =
    filteredDomains.length > 0 && filteredDomains.every((d) => selected.has(d));

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const d of filteredDomains) next.delete(d);
      } else {
        for (const d of filteredDomains) next.add(d);
      }
      return next;
    });
  }

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (password.trim()) h.Authorization = `Bearer ${password.trim()}`;
    return h;
  }

  async function restoreSelected() {
    const list = [...selected];
    if (list.length === 0) {
      setMessage({ type: "err", text: "Выберите хотя бы один домен" });
      return;
    }

    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/passed/${countryCode}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ restore: list }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        restored?: number;
        appendedToNew?: number;
        remainingPassed?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      const n = data.restored ?? 0;
      setMessage({
        type: "ok",
        text:
          n > 0
            ? `Возвращено в «новые»: ${n}${
                data.appendedToNew !== undefined && data.appendedToNew !== n
                  ? ` (добавлено в файл: ${data.appendedToNew})`
                  : ""
              }. Осталось пройденных: ${data.remainingPassed ?? "—"}`
            : (data.message ?? "Ничего не возвращено"),
      });
      await load();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось вернуть домены",
      });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Пройденные домены</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Отчёт по периоду (UTC+3), время на сайте и возврат в «Новые». Меньше 3 минут — красным.
        </p>
      </div>

      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Отчёт по прохождениям</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Пресеты или свой диапазон в календаре — список и сводка ниже обновляются сразу.
            </p>
          </div>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            В базе: {entries.length}
          </span>
        </div>

        <DateRangePicker
          value={range}
          onChange={setRange}
          label="Период прохождения"
          presets={["today", "yesterday", "thisWeek", "last7", "last30", "thisMonth"]}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Пройдено за период
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{report.total}</div>
          </div>
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Быстрее 3 мин
            </div>
            <div
              className="mt-1 text-2xl font-semibold tabular-nums"
              style={{ color: report.fast > 0 ? "#f87171" : "#e5e7eb" }}
            >
              {report.fast}
            </div>
          </div>
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Среднее время
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
              {report.avgMs != null ? formatDuration(report.avgMs) : "—"}
            </div>
          </div>
        </div>

        {report.byDay.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  <th className="py-2 pr-4 font-medium">Дата</th>
                  <th className="py-2 pr-4 font-medium">Пройдено</th>
                  <th className="py-2 pr-4 font-medium">Быстрее 3 мин</th>
                </tr>
              </thead>
              <tbody>
                {report.byDay.map(([day, c]) => (
                  <tr key={day} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4 font-mono text-gray-200">{day}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.count}</td>
                    <td
                      className="py-2 pr-4 tabular-nums font-semibold"
                      style={{ color: c.fast > 0 ? "#f87171" : "inherit" }}
                    >
                      {c.fast}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
          Пароль администратора{" "}
          <span className="font-normal">(если задан ADMIN_PASSWORD)</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full max-w-sm rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
          placeholder="••••••••"
        />
      </div>

      {message && (
        <p
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            color: message.type === "ok" ? "#34d399" : "#f87171",
            background: message.type === "ok" ? "rgba(52,211,153,.08)" : "rgba(248,113,113,.08)",
            border: `1px solid ${message.type === "ok" ? "rgba(52,211,153,.2)" : "rgba(248,113,113,.2)"}`,
          }}
          role="alert"
        >
          {message.text}
        </p>
      )}

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-xs" style={{ color: "var(--muted)" }}>
              Поиск по домену (в выбранном периоде)
            </label>
            {!loading && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                В периоде: {inPeriod.length}
                {filterQuery.trim() ? ` · показано: ${filtered.length}` : null}
                {selected.size > 0 ? ` · выбрано: ${selected.size}` : null}
              </span>
            )}
          </div>
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Фильтр…"
            className="mt-2 w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          {filtered.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAllFiltered}
                disabled={loading || restoring}
                className="rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                {allFilteredSelected ? "Снять все в фильтре" : "Выделить все в фильтре"}
              </button>
              <button
                type="button"
                onClick={restoreSelected}
                disabled={loading || restoring || selected.size === 0}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {restoring ? "Возврат…" : `Вернуть в «новые» (${selected.size})`}
              </button>
            </div>
          )}
        </div>

        <div className="max-h-[28rem] overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
              Загрузка…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
              {entries.length === 0
                ? "Пока нет пройденных — отметьте домены во вкладке «Новые домены»"
                : inPeriod.length === 0
                  ? "В выбранном периоде нет прохождений — смените даты в календаре"
                  : "Ничего не найдено"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-xs"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    <th className="w-10 px-3 py-2 font-medium" />
                    <th className="px-2 py-2 font-medium">Домен</th>
                    <th className="whitespace-nowrap px-3 py-2 text-center font-medium">
                      Дата и время
                    </th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">
                      Время на сайте
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const dur = durations.get(e.domain);
                    const isFast = typeof dur === "number" && dur < FAST_THRESHOLD_MS;
                    return (
                      <tr
                        key={`${e.domain}-${e.passedAt}`}
                        className="border-b last:border-b-0 hover:bg-white/[0.02]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-600"
                            checked={selected.has(e.domain)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(e.domain)) next.delete(e.domain);
                                else next.add(e.domain);
                                return next;
                              });
                            }}
                            id={`passed-${e.domain}`}
                            aria-label={e.domain}
                          />
                        </td>
                        <td className="min-w-0 px-2 py-2.5 align-middle">
                          <label
                            htmlFor={`passed-${e.domain}`}
                            className="cursor-pointer font-mono text-sm text-gray-200 break-all"
                          >
                            {e.domain}
                          </label>
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2.5 text-center align-middle font-mono text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {formatIsoPlus3(e.passedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle">
                          {dur == null ? (
                            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                              —
                            </span>
                          ) : (
                            <span
                              className="font-mono text-xs font-semibold"
                              style={{ color: isFast ? "#f87171" : "#34d399" }}
                              title={
                                isFast
                                  ? "Менее 3 минут с предыдущего прохождения"
                                  : "Интервал с предыдущей отметки"
                              }
                            >
                              {formatDuration(dur)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t px-4 py-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              load();
            }}
            disabled={loading || restoring}
            className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}
