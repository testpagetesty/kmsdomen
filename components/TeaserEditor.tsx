"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = { countryCode: string };

export function TeaserEditor({ countryCode }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [addText, setAddText] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [lines, filterQuery]);

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
          <h2 className="text-base font-semibold text-white">Проверенные тизеры</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Только добавление и точечное удаление — случайная перезапись невозможна
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
                  <span className="font-mono text-sm text-gray-200 break-all">{domain}</span>
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
