"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseDomainLines } from "@/lib/domainNormalize";

type Props = {
  countryCode: string;
  /** После переноса в «пройденные» обновить соседнюю вкладку */
  onPassedChange?: () => void;
};

export function DomainEditor({ countryCode, onPassedChange }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [marking, setMarking] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pickFilter, setPickFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(() => new Set());

  const lineList = useMemo(() => parseDomainLines(content), [content]);

  const filteredIndices = useMemo(() => {
    const q = pickFilter.trim().toLowerCase();
    const out: number[] = [];
    lineList.forEach((line, i) => {
      if (!q || line.toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [lineList, pickFilter]);

  const pickRows = useMemo(() => {
    const q = pickFilter.trim().toLowerCase();
    return lineList
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => !q || line.toLowerCase().includes(q));
  }, [lineList, pickFilter]);

  useEffect(() => {
    setSelectedIdx((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < lineList.length) next.add(i);
      }
      return next;
    });
  }, [lineList.length]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/domains/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      setContent(data.content ?? "");
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось загрузить файл",
      });
      setContent("");
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (password.trim()) h.Authorization = `Bearer ${password.trim()}`;
    return h;
  }

  function toggleAllFiltered() {
    setSelectedIdx((prev) => {
      const allSel = filteredIndices.length > 0 && filteredIndices.every((i) => prev.has(i));
      const next = new Set(prev);
      if (allSel) {
        for (const i of filteredIndices) next.delete(i);
      } else {
        for (const i of filteredIndices) next.add(i);
      }
      return next;
    });
  }

  async function markPassed() {
    const toMark = [...selectedIdx]
      .sort((a, b) => a - b)
      .map((i) => lineList[i])
      .filter(Boolean);
    if (toMark.length === 0) {
      setMessage({ type: "err", text: "Отметьте хотя бы один домен галочкой" });
      return;
    }

    setMarking(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/passed/${countryCode}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ mark: toMark }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        moved?: number;
        skippedNotInList?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      const moved = data.moved ?? 0;
      const skip = data.skippedNotInList ?? 0;
      let text =
        moved > 0
          ? `В «пройденные» перенесено: ${moved}. Осталось в новых: см. список после обновления.`
          : (data.message ?? "Ничего не перенесено");
      if (skip > 0 && moved > 0) text += ` Не найдено в списке (уже снято?): ${skip}.`;
      setMessage({ type: "ok", text });
      setSelectedIdx(new Set());
      await load();
      onPassedChange?.();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось отметить пройденными",
      });
    } finally {
      setMarking(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (password.trim()) {
        headers.Authorization = `Bearer ${password.trim()}`;
      }
      const res = await fetch(`/api/domains/${countryCode}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        content?: string;
        linesInRequest?: number;
        linesSaved?: number;
        duplicatesSkipped?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      if (typeof data.content === "string") {
        setContent(data.content);
      }
      const req = data.linesInRequest ?? 0;
      const saved = data.linesSaved ?? 0;
      const dup = data.duplicatesSkipped ?? 0;
      let text = `Сохранено на GitHub. Во входе строк: ${req}. Записано новых: ${saved}.`;
      if (dup > 0) text += ` Пропущено (уже в тизерах для этой страны): ${dup}.`;
      if (req === 0) text = "Сохранён пустой список.";
      else if (saved === 0 && dup > 0) {
        text = `Ничего не записано: все ${dup} домен(ов) уже есть в списке «Домены с тизерами» для этой страны.`;
      }
      setMessage({ type: "ok", text });
      await load();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось сохранить",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">Новые домены</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Сюда ежедневно подгружаются домены для прохождения. При сохранении домены сверяются со списком «Домены с тизерами»
          для этой же страны: совпадения не записываются, в ответе показывается, сколько пропущено и сколько сохранено.
        </p>
      </div>
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <label htmlFor="domains" className="mb-2 block text-sm font-medium text-white">
        Список (по одному в строке)
      </label>
      <textarea
        id="domains"
        disabled={loading}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={22}
        spellCheck={false}
        className="mb-4 w-full resize-y rounded-lg border bg-[#0d1117] px-3 py-2 font-mono text-sm leading-relaxed text-gray-100 outline-none focus:border-[var(--accent)] disabled:opacity-60"
        style={{ borderColor: "var(--border)", minHeight: "320px" }}
        placeholder={"example.com\nsite.org"}
      />

      {lineList.length > 0 && (
        <div
          className="mb-4 rounded-lg border p-4"
          style={{ borderColor: "var(--border)", background: "rgba(0,0,0,.15)" }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-white">Отметить пройденными</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Выбрано: {[...selectedIdx].filter((i) => i < lineList.length).length}
            </span>
          </div>
          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            Галочки снимают домен из этого списка и записывают его во вкладку «Пройденные домены» с датой и временем.
          </p>
          <input
            type="search"
            value={pickFilter}
            onChange={(e) => setPickFilter(e.target.value)}
            placeholder="Фильтр списка…"
            className="mb-2 w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleAllFiltered}
              disabled={loading || filteredIndices.length === 0}
              className="rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
              style={{ borderColor: "var(--border)" }}
            >
              {filteredIndices.length > 0 && filteredIndices.every((i) => selectedIdx.has(i))
                ? "Снять все в фильтре"
                : "Выделить все в фильтре"}
            </button>
            <button
              type="button"
              onClick={markPassed}
              disabled={loading || marking || selectedIdx.size === 0}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {marking ? "Перенос…" : "Перенести выбранные в пройденные"}
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
            <ul>
              {pickRows.map(({ line, i }) => (
                <li
                  key={i}
                  className="flex items-center gap-2 border-b px-2 py-1.5 last:border-b-0"
                  style={{ borderColor: "var(--border)" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIdx.has(i)}
                    onChange={() => {
                      setSelectedIdx((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      });
                    }}
                    className="h-4 w-4 shrink-0 rounded border-gray-600"
                    id={`pick-${i}`}
                  />
                  <label htmlFor={`pick-${i}`} className="min-w-0 flex-1 cursor-pointer font-mono text-xs text-gray-200 break-all">
                    {line}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="admin-pass" className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
          Пароль администратора{" "}
          <span className="font-normal">(если задан переменной ADMIN_PASSWORD на сервере)</span>
        </label>
        <input
          id="admin-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full max-w-md rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          style={{ borderColor: "var(--border)" }}
          placeholder="••••••••"
        />
      </div>

      {message ? (
        <p
          className="mb-4 text-sm"
          style={{ color: message.type === "ok" ? "#34d399" : "#f87171" }}
          role="alert"
        >
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить на GitHub"}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="rounded-lg border px-4 py-2.5 text-sm hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: "var(--border)" }}
        >
          Обновить из репозитория
        </button>
        {loading ? <span className="text-sm" style={{ color: "var(--muted)" }}>Загрузка…</span> : null}
      </div>
    </div>
    </div>
  );
}
