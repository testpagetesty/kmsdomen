"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Country } from "@/data/countries";
import type { EmployeesData } from "@/lib/employees";

type Props = {
  countries: Country[];
  /** Суффикс к href, например "?tab=teasers" */
  linkSuffix?: string;
  employeesData?: EmployeesData;
  /** Коды стран поднять вверх списка (например с прохождениями за период) */
  prioritizeCodes?: string[];
};

const AVATAR_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
];

function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * 17) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h]!;
}

export function CountrySearch({
  countries,
  linkSuffix = "",
  employeesData = { employees: [], assignments: {} },
  prioritizeCodes = [],
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  /** null = все, "" = без сотрудника, иначе employeeId */
  const [empFilter, setEmpFilter] = useState<string | null>(null);
  const prioritySet = useMemo(() => new Set(prioritizeCodes), [prioritizeCodes]);

  const nameByCountry = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    const byId = new Map(employeesData.employees.map((e) => [e.id, e.name]));
    for (const [code, empId] of Object.entries(employeesData.assignments)) {
      const name = byId.get(empId);
      if (name) map.set(code, { id: empId, name });
    }
    return map;
  }, [employeesData]);

  const filtered = useMemo(() => {
    let list = countries;
    if (empFilter === "") {
      list = list.filter((c) => !nameByCountry.has(c.code));
    } else if (empFilter) {
      list = list.filter((c) => nameByCountry.get(c.code)?.id === empFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const emp = nameByCountry.get(c.code)?.name.toLowerCase() ?? "";
        return (
          c.nameRu.toLowerCase().includes(q) ||
          c.code.includes(q) ||
          emp.includes(q)
        );
      });
    }
    if (prioritySet.size === 0) return list;
    return [...list].sort((a, b) => {
      const pa = prioritySet.has(a.code) ? 0 : 1;
      const pb = prioritySet.has(b.code) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.nameRu.localeCompare(b.nameRu, "ru");
    });
  }, [countries, query, empFilter, nameByCountry, prioritySet]);

  function handleDropdownChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    setSelected(code);
    if (code) router.push(`/country/${code}${linkSuffix}`);
  }

  return (
    <div>
      {employeesData.employees.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>
            Фильтр по сотруднику
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEmpFilter(null)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                empFilter === null ? "bg-white/10 text-white" : "hover:bg-white/5"
              }`}
              style={{ borderColor: "var(--border)", color: empFilter === null ? undefined : "var(--muted)" }}
            >
              Все
            </button>
            <button
              type="button"
              onClick={() => setEmpFilter("")}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                empFilter === "" ? "bg-white/10 text-white" : "hover:bg-white/5"
              }`}
              style={{ borderColor: "var(--border)", color: empFilter === "" ? undefined : "var(--muted)" }}
            >
              Без закрепления
            </button>
            {employeesData.employees.map((e) => {
              const active = empFilter === e.id;
              const color = colorForId(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEmpFilter(e.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active ? "text-white" : "hover:bg-white/5"
                  }`}
                  style={{
                    borderColor: active ? color : "var(--border)",
                    background: active ? `${color}33` : undefined,
                    color: active ? undefined : "var(--muted)",
                  }}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label htmlFor="country-select" className="mb-2 block text-sm font-medium" style={{ color: "var(--muted)" }}>
        Быстрый выбор
      </label>
      <select
        id="country-select"
        value={selected}
        onChange={handleDropdownChange}
        className="mb-5 w-full cursor-pointer appearance-none rounded-lg border bg-[var(--card)] px-4 py-3 text-white outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      >
        <option value="" disabled style={{ color: "#8b9cae" }}>
          — выберите страну из списка —
        </option>
        {countries.map((c) => {
          const emp = nameByCountry.get(c.code);
          return (
            <option key={c.code} value={c.code} style={{ background: "#1a2332" }}>
              {c.nameRu} ({c.code.toUpperCase()})
              {emp ? ` — ${emp.name}` : ""}
            </option>
          );
        })}
      </select>

      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>или найдите по названию / сотруднику</span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      <input
        type="search"
        autoComplete="off"
        placeholder="Страна, код или имя сотрудника…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-5 w-full rounded-lg border bg-[var(--card)] px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />

      <ul className="grid gap-2 sm:grid-cols-2">
        {filtered.map((c) => {
          const emp = nameByCountry.get(c.code);
          return (
            <li key={c.code}>
              <Link
                href={`/country/${c.code}${linkSuffix}`}
                prefetch={false}
                className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition hover:border-[var(--accent)] hover:bg-white/5"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-white">{c.nameRu}</span>
                    {emp && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                        style={{ background: `${colorForId(emp.id)}33`, color: colorForId(emp.id) }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: colorForId(emp.id) }}
                        />
                        {emp.name}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs uppercase" style={{ color: "var(--muted)" }}>
                  {c.code}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
          Ничего не найдено.
        </p>
      ) : (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>
          Показано: {filtered.length} из {countries.length}
        </p>
      )}
    </div>
  );
}
