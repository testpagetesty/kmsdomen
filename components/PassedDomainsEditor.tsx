"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = { countryCode: string };

type Entry = { domain: string; passedAt: string };

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

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

export function PassedDomainsEditor({ countryCode }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/passed/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { entries?: Entry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setEntries(data.entries ?? []);
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

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.domain.toLowerCase().includes(q));
  }, [entries, filterQuery]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Пройденные домены</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Домены, отмеченные галочкой во вкладке «Новые домены», с датой и временем отметки (UTC+3).
        </p>
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
              Поиск по домену
            </label>
            {!loading && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Всего: {entries.length}
                {filterQuery.trim() ? ` · показано: ${filtered.length}` : null}
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
                : "Ничего не найдено"}
            </p>
          ) : (
            <ul>
              {filtered.map((e) => (
                <li
                  key={`${e.domain}-${e.passedAt}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5 last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="font-mono text-sm text-gray-200 break-all">{e.domain}</span>
                  <span className="shrink-0 font-mono text-xs" style={{ color: "var(--muted)" }}>
                    {formatIsoPlus3(e.passedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t px-4 py-2" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            onClick={load}
            disabled={loading}
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
