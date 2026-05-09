"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  countryCode: string;
};

export function DomainEditor({ countryCode }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
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
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Ошибка ${res.status}`);
      }
      setMessage({ type: "ok", text: "Сохранено. Файл обновлён на GitHub." });
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
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <label htmlFor="domains" className="mb-2 block text-sm font-medium text-white">
        Список доменов (по одному в строке)
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
  );
}
