"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";

type Props = { countryCode: string };

type HistoryEvent = { domain: string; addedAt?: string; removedAt?: string };

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

function dateToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
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

export function TeaserEditor({ countryCode }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [addText, setAddText] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // История добавлений по датам (для фильтра)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => dateToYmd(new Date()));
  const [toDate, setToDate] = useState<string>(() => dateToYmd(new Date()));
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { lines?: string[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setLines(data.lines ?? []);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка загрузки" });
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set("from", fromDate);
      if (toDate) qs.set("to", toDate);
      const res = await fetch(`/api/teasers/${countryCode}/history?${qs.toString()}`, { cache: "no-store" });
      const data = (await res.json()) as { events?: HistoryEvent[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setEvents(data.events ?? []);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка истории" });
      setEvents([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [countryCode, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [lines, filterQuery]);

  const addedAtByDomain = useMemo(() => {
    // берём самое раннее добавление (если вдруг домен попадал несколько раз)
    const map = new Map<string, string>();
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.addedAt && !map.has(e.domain)) map.set(e.domain, e.addedAt);
    }
    return map;
  }, [events]);

  const byDay = useMemo(() => {
    const agg = new Map<string, { added: number; removed: number; net: number }>();
    for (const e of events) {
      const iso = e.addedAt ?? e.removedAt;
      if (!iso) continue;
      const day = formatIsoPlus3(iso).slice(0, 10);
      const cur = agg.get(day) ?? { added: 0, removed: 0, net: 0 };
      if (e.addedAt) {
        cur.added += 1;
        cur.net += 1;
      } else if (e.removedAt) {
        cur.removed += 1;
        cur.net -= 1;
      }
      agg.set(day, cur);
    }
    return Array.from(agg.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [events]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (password.trim()) h.Authorization = `Bearer ${password.trim()}`;
    return h;
  }

  async function handleAdd() {
    const toAdd = addText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (toAdd.length === 0) return;

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ add: toAdd }),
      });
      const data = (await res.json()) as { ok?: boolean; added?: number; total?: number; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      const msg = data.added === 0
        ? (data.message ?? "Все домены уже есть в списке")
        : `Добавлено: ${data.added}. Всего в списке: ${data.total}`;
      setMessage({ type: "ok", text: msg });
      setAddText("");
      await load();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка добавления" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(domain: string) {
    setDeletingDomain(domain);
    setMessage(null);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ domain }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setLines((prev) => prev.filter((l) => l !== domain));
      await loadHistory();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка удаления" });
    } finally {
      setDeletingDomain(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Заголовок и счётчик */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Домены с тизерами</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Только добавление и точечное удаление — список не перезаписывается целиком
          </p>
        </div>
        {!loading && (
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            {lines.length} доменов
          </span>
        )}
      </div>

      {/* Фильтр по датам (история добавлений) */}
      <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">История добавлений</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              Выберите период, чтобы увидеть сколько доменов добавлено и когда.
            </p>
          </div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {historyLoading ? "Загрузка…" : `Событий: ${events.length}`}
          </div>
        </div>

        <div className="mt-4">
          <DateRangePicker
            value={{ from: fromDate, to: toDate }}
            onChange={(r) => {
              setFromDate(r.from);
              setToDate(r.to);
            }}
          />
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={loadHistory}
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
            >
              Применить
            </button>
          </div>
        </div>

        {byDay.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: "var(--muted)" }}>
                  <th className="py-2 pr-4 font-medium">Дата</th>
                  <th className="py-2 pr-4 font-medium">Добавлено</th>
                  <th className="py-2 pr-4 font-medium">Удалено</th>
                  <th className="py-2 pr-4 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map(([day, c]) => (
                  <tr key={day} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4 font-mono text-gray-200">{day}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.added}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.removed}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.net}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Пароль */}
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

      {/* Сообщение */}
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

      {/* Список доменов */}
      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {/* Фильтр списка */}
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <input
            type="search"
            placeholder="Фильтр по домену…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
        </div>

        {/* Строки */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
              Загрузка…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
              {filterQuery ? "Ничего не найдено" : "Список пуст — добавьте первые домены ниже"}
            </p>
          ) : (
            <ul>
              {filtered.map((domain) => (
                <li
                  key={domain}
                  className="flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-white/[0.02]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sm text-gray-200 break-all">{domain}</div>
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      Добавлен:{" "}
                      <span className="font-mono">
                        {addedAtByDomain.get(domain) ? formatIsoPlus3(addedAtByDomain.get(domain)!) : "—"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(domain)}
                    disabled={deletingDomain === domain || saving}
                    title="Удалить домен"
                    className="flex-shrink-0 rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  >
                    {deletingDomain === domain ? "…" : "✕"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Счётчик фильтра */}
        {filterQuery && !loading && (
          <div
            className="border-t px-4 py-2 text-right text-xs"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            Показано {filtered.length} из {lines.length}
          </div>
        )}
      </div>

      {/* Добавление доменов */}
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label className="mb-2 block text-sm font-medium text-white">
          Добавить домены
        </label>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Вставьте один или несколько доменов — каждый с новой строки. Дубликаты игнорируются автоматически.
        </p>
        <textarea
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          rows={5}
          spellCheck={false}
          className="mb-4 w-full resize-y rounded-lg border bg-[#0d1117] px-3 py-2 font-mono text-sm text-gray-100 outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
          placeholder={"example.com\nanother-site.org"}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !addText.trim()}
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Добавление…" : "Добавить в список"}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading || saving}
            className="rounded-lg border px-4 py-2.5 text-sm hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}
