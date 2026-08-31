"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { VERTICALS } from "@/data/verticals";
import { parseTeaserTagsJson, type TeaserTagMeta } from "@/lib/teaserTags";

type Props = {
  countryCode: string;
  onPassedChange?: () => void;
};

type HistoryEvent = {
  domain: string;
  addedAt?: string;
  removedAt?: string;
  updatedAt?: string;
  action?: string;
};

function verticalOf(tags: Record<string, TeaserTagMeta>, domain: string): string {
  return tags[domain]?.vertical ?? "";
}

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

export function TeaserEditor({ countryCode, onPassedChange }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [addVertical, setAddVertical] = useState<string>("");
  const [addText, setAddText] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [tags, setTags] = useState<Record<string, TeaserTagMeta>>({});
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [marking, setMarking] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [passedSet, setPassedSet] = useState<Set<string>>(() => new Set());
  const [reordering, setReordering] = useState(false);
  const [dragDomain, setDragDomain] = useState<string | null>(null);

  // История добавлений по датам (для фильтра)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [fromDate, setFromDate] = useState<string>(() => dateToYmd(new Date()));
  const [toDate, setToDate] = useState<string>(() => dateToYmd(new Date()));
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  const loadPassed = useCallback(async () => {
    try {
      const res = await fetch(`/api/passed/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as {
        entries?: { domain: string; source?: string }[];
        error?: string;
      };
      if (!res.ok) return;
      const set = new Set<string>();
      for (const e of data.entries ?? []) {
        if (e.source === "teaser") set.add(e.domain);
      }
      setPassedSet(set);
    } catch {
      // ignore
    }
  }, [countryCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { lines?: string[]; tags?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setLines(data.lines ?? []);
      setTags(parseTeaserTagsJson(JSON.stringify(data.tags ?? {})));
      setSelected(new Set());
      await loadPassed();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка загрузки" });
    } finally {
      setLoading(false);
    }
  }, [countryCode, loadPassed]);

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
    return lines.filter((l) => {
            if (verticalFilter !== "all") {
              if (verticalFilter === "none") {
                if (verticalOf(tags, l)) return false;
              } else {
                const v = verticalOf(tags, l);
                if (v !== verticalFilter) return false;
              }
            }
      if (!q) return true;
      return l.toLowerCase().includes(q);
    });
  }, [lines, filterQuery, verticalFilter, tags]);

  // Порядок как в файле (ручная сортировка). Фильтр только отсекает, не пересортировывает.
  const displayList = filtered;

  const canReorder =
    !filterQuery.trim() && verticalFilter === "all" && !loading && lines.length > 1;

  const byDay = useMemo(() => {
    const agg = new Map<string, { added: number; removed: number; updated: number; net: number }>();
    for (const e of events) {
      const iso = e.addedAt ?? e.removedAt ?? e.updatedAt;
      if (!iso) continue;
      const day = formatIsoPlus3(iso).slice(0, 10);
      const cur = agg.get(day) ?? { added: 0, removed: 0, updated: 0, net: 0 };
      if (e.addedAt) {
        cur.added += 1;
        cur.net += 1;
      } else if (e.removedAt) {
        cur.removed += 1;
        cur.net -= 1;
      } else if (e.updatedAt && e.action === "update") {
        cur.updated += 1;
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

  async function saveOrder(nextLines: string[]) {
    setReordering(true);
    setMessage(null);
    const prev = lines;
    setLines(nextLines);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ order: nextLines }),
      });
      const data = (await res.json()) as { ok?: boolean; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      setMessage({ type: "ok", text: "Порядок сохранён" });
    } catch (e) {
      setLines(prev);
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось сохранить порядок",
      });
    } finally {
      setReordering(false);
      setDragDomain(null);
    }
  }

  function moveDomain(domain: string, dir: -1 | 1) {
    if (!canReorder || reordering) return;
    const i = lines.indexOf(domain);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lines.length) return;
    const next = [...lines];
    const tmp = next[i]!;
    next[i] = next[j]!;
    next[j] = tmp;
    void saveOrder(next);
  }

  function onDragStart(domain: string) {
    if (!canReorder || reordering) return;
    setDragDomain(domain);
  }

  function onDragOver(e: DragEvent, overDomain: string) {
    if (!canReorder || !dragDomain || dragDomain === overDomain) return;
    e.preventDefault();
  }

  function onDrop(overDomain: string) {
    if (!canReorder || !dragDomain || dragDomain === overDomain || reordering) {
      setDragDomain(null);
      return;
    }
    const from = lines.indexOf(dragDomain);
    const to = lines.indexOf(overDomain);
    if (from < 0 || to < 0) {
      setDragDomain(null);
      return;
    }
    const next = [...lines];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    void saveOrder(next);
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
        body: JSON.stringify({
          add: toAdd,
          ...(addVertical ? { vertical: addVertical } : { vertical: "none" }),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        added?: number;
        updated?: number;
        total?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);

      const parts: string[] = [];
      if ((data.added ?? 0) > 0) parts.push(`Новых: ${data.added}`);
      if ((data.updated ?? 0) > 0) parts.push(`Обновлено: ${data.updated}`);
      const msg =
        parts.length > 0
          ? `${parts.join(". ")}. Всего в списке: ${data.total ?? "—"}`
          : (data.message ?? "Нет изменений");
      setMessage({ type: "ok", text: msg });
      setAddText("");
      await load();
      await loadHistory();
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
      setTags((prev) => {
        const next = { ...prev };
        delete next[domain];
        return next;
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(domain);
        return next;
      });
      await loadHistory();
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Ошибка удаления" });
    } finally {
      setDeletingDomain(null);
    }
  }

  async function markPassed() {
    const toMark = [...selected];
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
        body: JSON.stringify({ mark: toMark, source: "teaser" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        domains?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Ошибка ${res.status}`);
      const count = data.domains?.length ?? toMark.length;
      setMessage({
        type: "ok",
        text: `В «пройденные с тизерами» добавлено: ${count}. Если домена не было в базе тизеров — он туда тоже записан.`,
      });
      setSelected(new Set());
      await loadPassed();
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

  async function deleteSelected() {
    const list = filtered.filter((d) => selected.has(d));
    if (list.length === 0) {
      setMessage({ type: "err", text: "Отметьте хотя бы один домен галочкой" });
      return;
    }
    if (!window.confirm(`Удалить из «Доменов с тизерами»: ${list.length}?`)) return;

    setBulkDeleting(true);
    setMessage(null);
    try {
      let ok = 0;
      for (const domain of list) {
        const res = await fetch(`/api/teasers/${countryCode}`, {
          method: "DELETE",
          headers: authHeaders(),
          body: JSON.stringify({ domain }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? `Ошибка ${res.status} для ${domain}`);
        }
        ok += 1;
      }
      setMessage({ type: "ok", text: `Удалено из тизеров: ${ok}` });
      setSelected(new Set());
      await load();
      await loadHistory();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось удалить",
      });
    } finally {
      setBulkDeleting(false);
    }
  }

  const filteredSelectedCount = useMemo(
    () => filtered.filter((d) => selected.has(d)).length,
    [filtered, selected],
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(d));

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const d of filtered) next.delete(d);
      } else {
        for (const d of filtered) next.add(d);
      }
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {/* Заголовок и счётчик */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Домены с тизерами</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            «Отметить пройденными» пишет в пройденные и при необходимости дописывает домен в эту базу
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
                  <th className="py-2 pr-4 font-medium">Обновлено</th>
                  <th className="py-2 pr-4 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody>
                {byDay.map(([day, c]) => (
                  <tr key={day} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 pr-4 font-mono text-gray-200">{day}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.added}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.removed}</td>
                    <td className="py-2 pr-4 tabular-nums text-gray-200">{c.updated}</td>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Вертикаль</label>
              <select
                value={verticalFilter}
                onChange={(e) => setVerticalFilter(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              >
                {VERTICALS.map((v) => (
                  <option key={v.id} value={v.id} style={{ background: "#0d1117" }}>
                    {v.label}
                  </option>
                ))}
                <option value="none" style={{ background: "#0d1117" }}>
                  Без вертикали
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Поиск</label>
              <input
                type="search"
                placeholder="Фильтр по домену…"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
          </div>
          {canReorder && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Порядок: перетащите домен или ↑↓. При фильтре сортировка недоступна.
              {reordering ? " Сохранение…" : ""}
            </p>
          )}
          {filtered.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleAllFiltered}
                disabled={loading || marking || bulkDeleting || saving || reordering}
                className="rounded border px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                {allFilteredSelected ? "Снять все в фильтре" : "Выделить все в фильтре"}
              </button>
              <button
                type="button"
                onClick={markPassed}
                disabled={loading || marking || bulkDeleting || saving || filteredSelectedCount === 0}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {marking
                  ? "Запись…"
                  : `Отметить пройденными (${filteredSelectedCount})`}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={loading || marking || bulkDeleting || saving || filteredSelectedCount === 0}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkDeleting ? "Удаление…" : `Удалить выбранные (${filteredSelectedCount})`}
              </button>
            </div>
          )}
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
              {displayList.map((domain, idx) => {
                const alreadyPassed = passedSet.has(domain);
                const isDragging = dragDomain === domain;
                return (
                <li
                  key={domain}
                  draggable={canReorder && !reordering}
                  onDragStart={() => onDragStart(domain)}
                  onDragOver={(e) => onDragOver(e, domain)}
                  onDrop={() => onDrop(domain)}
                  onDragEnd={() => setDragDomain(null)}
                  className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-white/[0.02] ${
                    canReorder ? "cursor-grab active:cursor-grabbing" : ""
                  } ${isDragging ? "opacity-50" : ""}`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {canReorder && (
                      <span
                        className="mt-1 select-none text-xs text-gray-600"
                        title="Перетащите"
                        aria-hidden
                      >
                        ⋮⋮
                      </span>
                    )}
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0 rounded border-gray-600"
                      checked={selected.has(domain)}
                      onChange={() => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(domain)) next.delete(domain);
                          else next.add(domain);
                          return next;
                        });
                      }}
                      id={`teaser-${domain}`}
                      aria-label={domain}
                    />
                    <div className="min-w-0">
                      <label
                        htmlFor={`teaser-${domain}`}
                        className="cursor-pointer font-mono text-sm text-gray-200 break-all"
                      >
                        {domain}
                      </label>
                      <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                        Вертикаль:{" "}
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-gray-200">
                          {VERTICALS.find((v) => v.id === verticalOf(tags, domain))?.label ??
                            (verticalOf(tags, domain) ? verticalOf(tags, domain) : "Без вертикали")}
                        </span>
                        {alreadyPassed && (
                          <>
                            {" · "}
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                              в пройденных
                            </span>
                          </>
                        )}
                        {" · "}
                        Добавлен:{" "}
                        <span className="font-mono">
                          {tags[domain]?.addedAt ? formatIsoPlus3(tags[domain].addedAt!) : "—"}
                        </span>
                        {" · "}
                        Обновлён:{" "}
                        <span className="font-mono">
                          {tags[domain]?.updatedAt ? formatIsoPlus3(tags[domain].updatedAt!) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {canReorder && (
                      <>
                        <button
                          type="button"
                          onClick={() => moveDomain(domain, -1)}
                          disabled={reordering || idx === 0}
                          title="Выше"
                          className="rounded-md px-1.5 py-1 text-xs text-gray-500 transition hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDomain(domain, 1)}
                          disabled={reordering || idx === displayList.length - 1}
                          title="Ниже"
                          className="rounded-md px-1.5 py-1 text-xs text-gray-500 transition hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(domain)}
                      disabled={deletingDomain === domain || saving || marking || reordering}
                      title="Удалить домен"
                      className="rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      {deletingDomain === domain ? "…" : "✕"}
                    </button>
                  </div>
                </li>
                );
              })}
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
          Вставьте один или несколько доменов — каждый с новой строки. Уже в списке — обновятся вертикаль и дата обновления; новые дописываются в конец.
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
              Вертикаль для добавляемых доменов (необязательно)
            </label>
            <select
              value={addVertical}
              onChange={(e) => setAddVertical(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            >
              <option value="" style={{ background: "#0d1117" }}>
                Без вертикали
              </option>
              {VERTICALS.filter((v) => v.id !== "all").map((v) => (
                <option key={v.id} value={v.id} style={{ background: "#0d1117" }}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
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
