"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, type Country } from "@/data/countries";
import { emptyEmployeesData, type EmployeesData } from "@/lib/employees";

type Props = {
  currentCode: string;
};

export function CountrySwitcher({ currentCode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [employeesData, setEmployeesData] = useState<EmployeesData>(emptyEmployeesData);

  const tab = searchParams.get("tab");
  const tabSuffix =
    tab === "teasers" ? "?tab=teasers" : tab === "passed" ? "?tab=passed" : "?tab=domains";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/employees", { cache: "no-store" });
        const data = (await res.json()) as EmployeesData;
        if (!cancelled && res.ok) {
          setEmployeesData({
            employees: data.employees ?? [],
            assignments: data.assignments ?? {},
            priorityCountries: data.priorityCountries ?? [],
          });
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

  const nameByCode = useMemo(() => {
    const byId = new Map(employeesData.employees.map((e) => [e.id, e.name]));
    const m = new Map<string, string>();
    for (const [code, empId] of Object.entries(employeesData.assignments)) {
      const name = byId.get(empId);
      if (name) m.set(code, name);
    }
    return m;
  }, [employeesData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => {
      const emp = nameByCode.get(c.code)?.toLowerCase() ?? "";
      return c.nameRu.toLowerCase().includes(q) || c.code.includes(q) || emp.includes(q);
    });
  }, [query, nameByCode]);

  function goTo(c: Country) {
    if (c.code === currentCode) {
      setOpen(false);
      return;
    }
    router.push(`/country/${c.code}${tabSuffix}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <label className="mb-1 block text-[11px]" style={{ color: "var(--muted)" }}>
        Другая страна
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border bg-[#0d1117] px-3 py-2 text-left text-sm text-white outline-none hover:border-[var(--accent)] focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">Найти и перейти…</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border shadow-2xl"
          style={{ borderColor: "rgba(59,130,246,.35)", background: "rgba(15,20,25,.98)" }}
          role="listbox"
        >
          <div className="border-b p-2" style={{ borderColor: "var(--border)" }}>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Название, код или сотрудник…"
              className="w-full rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs" style={{ color: "var(--muted)" }}>
                Ничего не найдено
              </li>
            ) : (
              filtered.map((c) => {
                const emp = nameByCode.get(c.code);
                const active = c.code === currentCode;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => goTo(c)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                        active ? "bg-[var(--accent)]/25 text-white" : "text-gray-200 hover:bg-white/5"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {c.nameRu}
                        {emp ? (
                          <span className="ml-2 text-[11px]" style={{ color: active ? "#bfdbfe" : "var(--muted)" }}>
                            {emp}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                        {c.code}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
