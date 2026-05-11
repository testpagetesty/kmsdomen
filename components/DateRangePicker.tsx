"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Ymd = string; // YYYY-MM-DD

export type DateRange = { from: Ymd; to: Ymd };

type PresetId = "today" | "last7" | "last30" | "thisMonth";

type Props = {
  value: DateRange;
  onChange: (next: DateRange) => void;
  presets?: PresetId[];
};

const RU_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const RU_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toYmd(d: Date): Ymd {
  // UTC date-only (stable across timezones)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseYmd(ymd: Ymd): Date {
  // Date at UTC midnight
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function cmpYmd(a: Ymd, b: Ymd) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clampRange(from: Ymd, to: Ymd): DateRange {
  return cmpYmd(from, to) <= 0 ? { from, to } : { from: to, to: from };
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function monthStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUtc(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function startDowMon1(d: Date): number {
  // Monday = 1 ... Sunday = 7
  const js = d.getUTCDay(); // 0..6, 0=Sun
  return js === 0 ? 7 : js;
}

function formatRangeLabel(r: DateRange): string {
  return `${r.from} → ${r.to}`;
}

export function DateRangePicker({ value, onChange, presets = ["today", "last7", "last30", "thisMonth"] }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"from" | "to">("from");
  const [cursorMonth, setCursorMonth] = useState<Date>(() => monthStartUtc(parseYmd(value.to)));

  // close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    // keep cursor around selected end
    setCursorMonth(monthStartUtc(parseYmd(value.to)));
  }, [value.to]);

  const grid = useMemo(() => {
    const start = monthStartUtc(cursorMonth);
    const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    const first = startDowMon1(start); // 1..7
    const cells: Array<{ ymd: Ymd; inMonth: boolean }> = [];

    // leading days from previous month
    for (let i = 1; i < first; i++) {
      const d = addDaysUtc(start, -(first - i));
      cells.push({ ymd: toYmd(d), inMonth: false });
    }
    // current month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
      cells.push({ ymd: toYmd(d), inMonth: true });
    }
    // trailing to 6 rows (42)
    while (cells.length < 42) {
      const last = parseYmd(cells[cells.length - 1]!.ymd);
      const d = addDaysUtc(last, 1);
      cells.push({ ymd: toYmd(d), inMonth: false });
    }
    return cells;
  }, [cursorMonth]);

  const isInRange = useMemo(() => {
    const r = clampRange(value.from, value.to);
    return (ymd: Ymd) => cmpYmd(ymd, r.from) >= 0 && cmpYmd(ymd, r.to) <= 0;
  }, [value.from, value.to]);

  const isStart = (ymd: Ymd) => ymd === clampRange(value.from, value.to).from;
  const isEnd = (ymd: Ymd) => ymd === clampRange(value.from, value.to).to;

  function applyPreset(id: PresetId) {
    const now = new Date();
    const today = toYmd(now);
    if (id === "today") onChange({ from: today, to: today });
    if (id === "last7") onChange({ from: toYmd(addDaysUtc(parseYmd(today), -6)), to: today });
    if (id === "last30") onChange({ from: toYmd(addDaysUtc(parseYmd(today), -29)), to: today });
    if (id === "thisMonth") {
      const first = monthStartUtc(now);
      onChange({ from: toYmd(first), to: today });
    }
  }

  function pickDay(ymd: Ymd) {
    if (mode === "from") {
      const next = clampRange(ymd, value.to);
      onChange(next);
      setMode("to");
      return;
    }
    const next = clampRange(value.from, ymd);
    onChange(next);
    setOpen(false);
    setMode("from");
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
        Дата добавления
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="font-mono">{formatRangeLabel(clampRange(value.from, value.to))}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Выбрать
        </span>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-full rounded-xl border p-4 shadow-2xl"
          style={{ borderColor: "rgba(59, 130, 246, 0.35)", background: "rgba(15, 20, 25, 0.98)" }}
          role="dialog"
          aria-label="Выбор периода"
        >
          {/* Presets */}
          <div className="mb-3 flex flex-wrap gap-2">
            {presets.includes("today") && (
              <button
                type="button"
                onClick={() => applyPreset("today")}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white/5"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Сегодня
              </button>
            )}
            {presets.includes("last7") && (
              <button
                type="button"
                onClick={() => applyPreset("last7")}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white/5"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                7 дней
              </button>
            )}
            {presets.includes("last30") && (
              <button
                type="button"
                onClick={() => applyPreset("last30")}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white/5"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                30 дней
              </button>
            )}
            {presets.includes("thisMonth") && (
              <button
                type="button"
                onClick={() => applyPreset("thisMonth")}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-white/5"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                Этот месяц
              </button>
            )}

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode("from")}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === "from" ? "bg-[var(--accent)] text-white" : "text-gray-300 hover:bg-white/5"}`}
              >
                С
              </button>
              <button
                type="button"
                onClick={() => setMode("to")}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${mode === "to" ? "bg-[var(--accent)] text-white" : "text-gray-300 hover:bg-white/5"}`}
              >
                По
              </button>
            </div>
          </div>

          {/* Header */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCursorMonth((m) => addMonthsUtc(m, -1))}
              className="rounded-lg border px-2 py-2 text-xs hover:bg-white/5"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              aria-label="Предыдущий месяц"
            >
              ←
            </button>
            <div className="text-sm font-semibold text-white">
              {RU_MONTHS[cursorMonth.getUTCMonth()]} {cursorMonth.getUTCFullYear()}
            </div>
            <button
              type="button"
              onClick={() => setCursorMonth((m) => addMonthsUtc(m, 1))}
              className="rounded-lg border px-2 py-2 text-xs hover:bg-white/5"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              aria-label="Следующий месяц"
            >
              →
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold" style={{ color: "var(--muted)" }}>
            {RU_WEEKDAYS.map((w) => (
              <div key={w} className="py-1">{w}</div>
            ))}
          </div>

          {/* Days */}
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              const inRange = isInRange(cell.ymd);
              const start = isStart(cell.ymd);
              const end = isEnd(cell.ymd);
              const base = cell.inMonth ? "text-gray-100" : "text-gray-600";
              const bg = start || end ? "bg-[var(--accent)]" : inRange ? "bg-white/10" : "bg-transparent";
              const ring = start || end ? "ring-2 ring-blue-300/40" : "ring-1 ring-white/5";
              return (
                <button
                  key={cell.ymd}
                  type="button"
                  onClick={() => pickDay(cell.ymd)}
                  className={`h-9 rounded-lg text-center text-sm ${base} ${bg} ${ring} hover:bg-white/10`}
                  title={cell.ymd}
                >
                  {Number(cell.ymd.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
            <span>
              Выбор: <span className="font-mono">{mode === "from" ? "С" : "По"}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border px-3 py-2 hover:bg-white/5"
              style={{ borderColor: "var(--border)" }}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

