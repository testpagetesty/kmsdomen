"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { DateRangePicker, type DateRange } from "@/components/DateRangePicker";
import type { PassedSource } from "@/lib/passedDomains";

type Props = { countryCode: string };

type Entry = { domain: string; passedAt: string; source: PassedSource };

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const FAST_THRESHOLD_MS = 3 * 60 * 1000;
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

function entryKey(e: { domain: string; passedAt: string }): string {
  return `${e.domain}@@${e.passedAt}`;
}

function durationMapFor(entries: Entry[]): Map<string, number | null> {
  const chrono = [...entries].sort((a, b) =>
    a.passedAt < b.passedAt ? -1 : a.passedAt > b.passedAt ? 1 : 0,
  );
  const map = new Map<string, number | null>();
  for (let i = 0; i < chrono.length; i++) {
    const cur = chrono[i]!;
    const key = entryKey(cur);
    if (i === 0) {
      map.set(key, null);
      continue;
    }
    const prev = chrono[i - 1]!;
    const tCur = new Date(cur.passedAt).getTime();
    const tPrev = new Date(prev.passedAt).getTime();
    if (Number.isNaN(tCur) || Number.isNaN(tPrev)) {
      map.set(key, null);
      continue;
    }
    const delta = tCur - tPrev;
    map.set(key, delta > 0 && delta <= SESSION_GAP_MS ? delta : null);
  }
  return map;
}

function inDateRange(iso: string, from: string, to: string): boolean {
  const day = isoToDayKey(iso);
  if (!day) return false;
  return day >= from && day <= to;
}

function normalizeEntry(raw: {
  domain: string;
  passedAt: string;
  source?: string;
}): Entry {
  return {
    domain: raw.domain,
    passedAt: raw.passedAt,
    source: raw.source === "teaser" ? "teaser" : "new",
  };
}

type SectionProps = {
  title: string;
  hint: string;
  entries: Entry[];
  durations: Map<string, number | null>;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  restoreLabel: string;
  onRestore: (domains: string[]) => void;
  onDelete: (domains: string[]) => void;
  busy: boolean;
  loading: boolean;
  emptyText: string;
};

function PassedSection({
  title,
  hint,
  entries,
  durations,
  selected,
  setSelected,
  restoreLabel,
  onRestore,
  onDelete,
  busy,
  loading,
  emptyText,
}: SectionProps) {
  const domains = entries.map((e) => e.domain);
  const allSelected = domains.length > 0 && domains.every((d) => selected.has(d));
  const selectedInSection = domains.filter((d) => selected.has(d)).length;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const d of domains) next.delete(d);
      } else {
        for (const d of domains) next.add(d);
      }
      return next;
    });
  }

  return (
    <div
      className="rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
              {hint}
            </p>
          </div>
          <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
            {entries.length}
            {selectedInSection > 0 ? ` · выбрано: ${selectedInSection}` : null}
          </span>
        </div>
        {entries.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAll}
              disabled={loading || busy}
              className="rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}
            >
              {allSelected ? "Снять все" : "Выделить все"}
            </button>
            <button
              type="button"
              onClick={() => onRestore(domains.filter((d) => selected.has(d)))}
              disabled={loading || busy || selectedInSection === 0}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "…" : `${restoreLabel} (${selectedInSection})`}
            </button>
            <button
              type="button"
              onClick={() => onDelete(domains.filter((d) => selected.has(d)))}
              disabled={loading || busy || selectedInSection === 0}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Удалить насовсем ({selectedInSection})
            </button>
          </div>
        )}
      </div>

      <div className="max-h-[22rem] overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            Загрузка…
          </p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            {emptyText}
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
                {entries.map((e) => {
                  const dur = durations.get(entryKey(e));
                  const isFast = typeof dur === "number" && dur < FAST_THRESHOLD_MS;
                  return (
                    <tr
                      key={`${e.source}-${e.domain}-${e.passedAt}`}
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
                          id={`passed-${e.source}-${e.domain}`}
                          aria-label={e.domain}
                        />
                      </td>
                      <td className="min-w-0 px-2 py-2.5 align-middle">
                        <label
                          htmlFor={`passed-${e.source}-${e.domain}`}
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
    </div>
  );
}

export function PassedDomainsEditor({ countryCode }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [uniqueDomains, setUniqueDomains] = useState(0);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const data = (await res.json()) as {
        entries?: { domain: string; passedAt: string; source?: string }[];
        uniqueDomains?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      const list = (data.entries ?? []).map(normalizeEntry);
      setEntries(list);
      setUniqueDomains(data.uniqueDomains ?? new Set(list.map((e) => e.domain)).size);
      setSelected(new Set());
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка загрузки" });
      setEntries([]);
      setUniqueDomains(0);
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

  const teaserEntries = useMemo(
    () => filtered.filter((e) => e.source === "teaser"),
    [filtered],
  );
  const newEntries = useMemo(
    () => filtered.filter((e) => e.source !== "teaser"),
    [filtered],
  );

  const report = useMemo(() => {
    let fast = 0;
    let timed = 0;
    let sumMs = 0;
    const byDay = new Map<string, { count: number; fast: number }>();
    let teaser = 0;
    let fromNew = 0;

    for (const e of inPeriod) {
      if (e.source === "teaser") teaser += 1;
      else fromNew += 1;

      const day = isoToDayKey(e.passedAt) ?? "—";
      const cur = byDay.get(day) ?? { count: 0, fast: 0 };
      cur.count += 1;

      const dur = durations.get(entryKey(e));
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
      teaser,
      fromNew,
      fast,
      timed,
      avgMs: timed > 0 ? Math.round(sumMs / timed) : null,
      byDay: Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    };
  }, [inPeriod, durations]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (password.trim()) h.Authorization = `Bearer ${password.trim()}`;
    return h;
  }

  async function restoreDomains(list: string[]) {
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
        restoredNew?: number;
        restoredTeaser?: number;
        appendedToNew?: number;
        remainingPassed?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      const n = data.restored ?? 0;
      const parts: string[] = [];
      if ((data.restoredNew ?? 0) > 0) {
        parts.push(`в «новые»: ${data.restoredNew}`);
      }
      if ((data.restoredTeaser ?? 0) > 0) {
        parts.push(`снято с пройденных (тизеры остались): ${data.restoredTeaser}`);
      }
      setMessage({
        type: "ok",
        text:
          n > 0
            ? `Убрано из пройденных: ${n}${parts.length ? ` (${parts.join("; ")})` : ""}. Осталось: ${data.remainingPassed ?? "—"}`
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

  async function deleteDomains(list: string[]) {
    if (list.length === 0) {
      setMessage({ type: "err", text: "Выберите хотя бы один домен" });
      return;
    }
    if (!window.confirm(`Удалить насовсем ${list.length} домен(ов) из пройденных?`)) return;

    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/passed/${countryCode}`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ remove: list }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        removed?: number;
        remainingPassed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setMessage({
        type: "ok",
        text: `Удалено насовсем: ${data.removed ?? list.length}. Осталось пройденных: ${data.remainingPassed ?? "—"}`,
      });
      await load();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось удалить",
      });
    } finally {
      setDeleting(false);
    }
  }

  const busy = restoring || deleting;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Пройденные домены</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Два раздела: с тизерами (остаются в тизерах) и из «Новых». Меньше 3 минут — красным.
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
              Только эта страна. Сводка по всем сотрудникам — на главной во вкладке «Пройденные».
            </p>
            <Link
              href="/?section=passed"
              prefetch={false}
              className="mt-2 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              ← Отчёт по сотрудникам за сегодня
            </Link>
          </div>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            В базе: {uniqueDomains} дом. · событий: {entries.length}
          </span>
        </div>

        <DateRangePicker
          value={range}
          onChange={setRange}
          label="Период прохождения"
          presets={["today", "yesterday", "thisWeek", "last7", "last30", "thisMonth"]}
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Всего за период
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{report.total}</div>
          </div>
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              С тизерами
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{report.teaser}</div>
          </div>
          <div
            className="rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.2)" }}
          >
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              Из новых
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-white">{report.fromNew}</div>
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

      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
          Поиск по домену (в выбранном периоде)
        </label>
        <input
          type="search"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Фильтр…"
          className="w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
        />
        {!loading && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            В периоде: {inPeriod.length}
            {filterQuery.trim() ? ` · показано: ${filtered.length}` : null}
          </p>
        )}
      </div>

      {!loading && entries.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          Пока нет пройденных — отметьте домены во вкладках «Новые» или «Тизеры»
        </p>
      ) : !loading && inPeriod.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          В выбранном периоде нет прохождений — смените даты в календаре
        </p>
      ) : (
        <div className="space-y-4">
          <PassedSection
            title="Пройденные домены с тизерами"
            hint="Из «Доменов с тизерами» или найденные с тизерами (добавляются в базу тизеров)"
            entries={teaserEntries}
            durations={durations}
            selected={selected}
            setSelected={setSelected}
            restoreLabel="Убрать из пройденных"
            onRestore={restoreDomains}
            onDelete={deleteDomains}
            busy={busy}
            loading={loading}
            emptyText={
              filterQuery.trim()
                ? "Ничего не найдено в этом разделе"
                : "За период нет пройденных с тизерами"
            }
          />
          <PassedSection
            title="Пройденные домены новые"
            hint="Перенесены из «Новых доменов» — можно вернуть обратно в новые или удалить"
            entries={newEntries}
            durations={durations}
            selected={selected}
            setSelected={setSelected}
            restoreLabel="Вернуть в «новые»"
            onRestore={restoreDomains}
            onDelete={deleteDomains}
            busy={busy}
            loading={loading}
            emptyText={
              filterQuery.trim()
                ? "Ничего не найдено в этом разделе"
                : "За период нет пройденных из новых"
            }
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMessage(null);
          load();
        }}
        disabled={loading || busy}
        className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
        style={{ borderColor: "var(--border)" }}
      >
        Обновить
      </button>
    </div>
  );
}
