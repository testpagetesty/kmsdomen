"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Country } from "@/data/countries";
import type { Employee, EmployeesData } from "@/lib/employees";

type Props = {
  countries: Country[];
  data: EmployeesData;
  onSaved: (next: EmployeesData) => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `e${Date.now().toString(36)}`;
}

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

export function EmployeeAssignments({ countries, data, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(data.employees);
  const [assignments, setAssignments] = useState<Record<string, string>>(data.assignments);
  const [priorityCountries, setPriorityCountries] = useState<string[]>(
    data.priorityCountries ?? [],
  );
  const [newName, setNewName] = useState("");
  const [activeEmpId, setActiveEmpId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [priorityQuery, setPriorityQuery] = useState("");

  useEffect(() => {
    setEmployees(data.employees);
    setAssignments(data.assignments);
    setPriorityCountries(data.priorityCountries ?? []);
  }, [data]);

  useEffect(() => {
    if (!activeEmpId && employees.length > 0) setActiveEmpId(employees[0]!.id);
    if (activeEmpId && !employees.some((e) => e.id === activeEmpId)) {
      setActiveEmpId(employees[0]?.id ?? null);
    }
  }, [employees, activeEmpId]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const empId of Object.values(assignments)) {
      m.set(empId, (m.get(empId) ?? 0) + 1);
    }
    return m;
  }, [assignments]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.nameRu.toLowerCase().includes(q) || c.code.includes(q),
    );
  }, [countries, countryQuery]);

  function addEmployee() {
    const name = newName.trim();
    if (!name) return;
    if (employees.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      setMessage({ type: "err", text: "Такой сотрудник уже есть" });
      return;
    }
    const emp = { id: newId(), name };
    setEmployees((prev) => [...prev, emp]);
    setActiveEmpId(emp.id);
    setNewName("");
    setMessage(null);
  }

  function removeEmployee(id: string) {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [code, empId] of Object.entries(next)) {
        if (empId === id) delete next[code];
      }
      return next;
    });
  }

  function toggleCountry(code: string) {
    if (!activeEmpId) return;
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[code] === activeEmpId) {
        delete next[code];
      } else {
        next[code] = activeEmpId;
      }
      return next;
    });
  }

  function assignAllFiltered() {
    if (!activeEmpId) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const c of filteredCountries) next[c.code] = activeEmpId;
      return next;
    });
  }

  function clearActiveFromFiltered() {
    if (!activeEmpId) return;
    setAssignments((prev) => {
      const next = { ...prev };
      for (const c of filteredCountries) {
        if (next[c.code] === activeEmpId) delete next[c.code];
      }
      return next;
    });
  }

  function togglePriority(code: string) {
    setPriorityCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      return [...prev, code];
    });
  }

  const prioritySet = useMemo(() => new Set(priorityCountries), [priorityCountries]);

  const priorityList = useMemo(() => {
    const byCode = new Map(countries.map((c) => [c.code, c]));
    return priorityCountries
      .map((code) => byCode.get(code))
      .filter((c): c is Country => Boolean(c));
  }, [priorityCountries, countries]);

  const priorityCandidates = useMemo(() => {
    const q = priorityQuery.trim().toLowerCase();
    return countries.filter((c) => {
      if (prioritySet.has(c.code)) return false;
      if (!q) return true;
      return c.nameRu.toLowerCase().includes(q) || c.code.includes(q);
    });
  }, [countries, priorityQuery, prioritySet]);

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (password.trim()) headers.Authorization = `Bearer ${password.trim()}`;
      const payload: EmployeesData = { employees, assignments, priorityCountries };
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      const dataRes = (await res.json()) as EmployeesData & { error?: string };
      if (!res.ok) throw new Error(dataRes.error ?? `Ошибка ${res.status}`);
      onSaved({
        employees: dataRes.employees,
        assignments: dataRes.assignments,
        priorityCountries: dataRes.priorityCountries ?? [],
      });
      setMessage({ type: "ok", text: "Закрепления сохранены на GitHub" });
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "Не удалось сохранить",
      });
    } finally {
      setSaving(false);
    }
  }, [employees, assignments, priorityCountries, password, onSaved]);

  const activeEmp = employees.find((e) => e.id === activeEmpId) ?? null;
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name);
    return m;
  }, [employees]);

  return (
    <div
      className="mb-6 overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <div>
          <div className="text-sm font-semibold text-white">Сотрудники и страны</div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Закрепите страны за сотрудниками — имя появится рядом со страной в списке
            {employees.length > 0
              ? ` · ${employees.length} сотр. · ${Object.keys(assignments).length} стран · ${priorityCountries.length} приор.`
              : null}
          </div>
        </div>
        <span className="text-xs font-medium text-blue-400">{open ? "Свернуть" : "Настроить"}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-4" style={{ borderColor: "var(--border)" }}>
          {/* Employees row */}
          <div className="mb-4">
            <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>
              Сотрудники
            </div>
            <div className="flex flex-wrap gap-2">
              {employees.map((e) => {
                const active = e.id === activeEmpId;
                const color = colorForId(e.id);
                return (
                  <div
                    key={e.id}
                    className={`flex items-center gap-1.5 rounded-full border pl-1 pr-1 py-1 transition ${
                      active ? "ring-2 ring-blue-400/50" : ""
                    }`}
                    style={{
                      borderColor: active ? color : "var(--border)",
                      background: active ? `${color}22` : "transparent",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveEmpId(e.id)}
                      className="flex items-center gap-2 rounded-full pl-1.5 pr-2 py-0.5"
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: color }}
                      >
                        {e.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-sm text-white">{e.name}</span>
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>
                        {counts.get(e.id) ?? 0}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Удалить сотрудника"
                      onClick={() => removeEmployee(e.id)}
                      className="mr-1 rounded-full px-1.5 text-xs text-gray-500 hover:bg-red-500/15 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmployee();
                  }
                }}
                placeholder="Имя сотрудника…"
                className="min-w-[12rem] flex-1 rounded-lg border bg-[#0d1117] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
              <button
                type="button"
                onClick={addEmployee}
                disabled={!newName.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-40"
              >
                Добавить
              </button>
            </div>
          </div>

          {activeEmp ? (
            <div className="mb-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-white">
                  Страны для{" "}
                  <span className="font-semibold" style={{ color: colorForId(activeEmp.id) }}>
                    {activeEmp.name}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={assignAllFiltered}
                    className="rounded border px-2 py-1 text-[11px] hover:bg-white/5"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    Все в фильтре → {activeEmp.name}
                  </button>
                  <button
                    type="button"
                    onClick={clearActiveFromFiltered}
                    className="rounded border px-2 py-1 text-[11px] hover:bg-white/5"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    Снять в фильтре
                  </button>
                </div>
              </div>
              <input
                type="search"
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder="Фильтр стран…"
                className="mb-2 w-full rounded-lg border bg-[#0d1117] px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
              <div className="max-h-56 overflow-y-auto">
                <ul className="grid gap-1 sm:grid-cols-2">
                  {filteredCountries.map((c) => {
                    const assignedId = assignments[c.code];
                    const mine = assignedId === activeEmp.id;
                    const otherName = assignedId && !mine ? nameById.get(assignedId) : undefined;
                    return (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => toggleCountry(c.code)}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                            mine ? "border-blue-500/50 bg-blue-500/10" : "hover:bg-white/[0.03]"
                          }`}
                          style={{ borderColor: mine ? undefined : "var(--border)" }}
                        >
                          <span className="min-w-0 truncate text-gray-200">
                            {c.nameRu}{" "}
                            <span className="font-mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                              {c.code}
                            </span>
                          </span>
                          {mine ? (
                            <span className="shrink-0 text-[10px] font-semibold text-blue-300">✓</span>
                          ) : otherName ? (
                            <span className="shrink-0 truncate text-[10px]" style={{ color: "var(--muted)" }}>
                              {otherName}
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px]" style={{ color: "var(--muted)" }}>
                              —
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
              Добавьте хотя бы одного сотрудника, затем отметьте его страны.
            </p>
          )}

          <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-2">
              <div className="text-sm font-medium text-white">Приоритетные страны</div>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                Отдельный список для ежедневного контроля в отчёте «Пройденные»
              </p>
            </div>
            {priorityList.length > 0 ? (
              <ul className="mb-3 flex flex-wrap gap-2">
                {priorityList.map((c) => {
                  const empId = assignments[c.code];
                  const empName = empId ? nameById.get(empId) : undefined;
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        title="Убрать из приоритетных"
                        onClick={() => togglePriority(c.code)}
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs hover:border-red-400/40 hover:bg-red-500/10"
                        style={{
                          borderColor: "rgba(251,191,36,.35)",
                          background: "rgba(251,191,36,.08)",
                        }}
                      >
                        <span className="text-amber-300">★</span>
                        <span className="text-white">{c.nameRu}</span>
                        <span className="font-mono uppercase" style={{ color: "var(--muted)" }}>
                          {c.code}
                        </span>
                        {empName && (
                          <span style={{ color: "var(--muted)" }}>{empName}</span>
                        )}
                        <span className="text-gray-500">×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
                Список пуст — добавьте страны ниже
              </p>
            )}
            <input
              type="search"
              value={priorityQuery}
              onChange={(e) => setPriorityQuery(e.target.value)}
              placeholder="Добавить страну в приоритетные…"
              className="mb-2 w-full rounded-lg border bg-[#0d1117] px-3 py-1.5 text-sm text-white outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <div className="max-h-36 overflow-y-auto">
              <ul className="grid gap-1 sm:grid-cols-2">
                {priorityCandidates.slice(0, 40).map((c) => {
                  const empId = assignments[c.code];
                  const empName = empId ? nameById.get(empId) : undefined;
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => togglePriority(c.code)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-left text-sm hover:bg-amber-500/10"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <span className="truncate text-gray-200">
                          {c.nameRu}{" "}
                          <span className="font-mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                            {c.code}
                          </span>
                        </span>
                        <span className="shrink-0 text-[10px]" style={{ color: "var(--muted)" }}>
                          {empName ?? "—"} · +
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {priorityCandidates.length === 0 && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {priorityQuery.trim() ? "Ничего не найдено" : "Все страны уже в приоритете"}
                </p>
              )}
            </div>
          </div>

          <div className="mb-3">
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
              className="mb-3 text-sm"
              style={{ color: message.type === "ok" ? "#34d399" : "#f87171" }}
              role="alert"
            >
              {message.text}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить закрепления"}
          </button>
        </div>
      )}
    </div>
  );
}
