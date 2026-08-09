export type Employee = { id: string; name: string };

/** assignments: countryCode → employeeId; priorityCountries — ежедневный контроль */
export type EmployeesData = {
  employees: Employee[];
  assignments: Record<string, string>;
  priorityCountries: string[];
};

export function emptyEmployeesData(): EmployeesData {
  return { employees: [], assignments: {}, priorityCountries: [] };
}

export function parseEmployeesJson(text: string): EmployeesData {
  if (!text.trim()) return emptyEmployeesData();
  try {
    const o = JSON.parse(text) as unknown;
    if (!o || typeof o !== "object") return emptyEmployeesData();
    const raw = o as {
      employees?: unknown;
      assignments?: unknown;
      priorityCountries?: unknown;
    };
    const employees: Employee[] = [];
    if (Array.isArray(raw.employees)) {
      for (const e of raw.employees) {
        if (!e || typeof e !== "object") continue;
        const id = typeof (e as { id?: unknown }).id === "string" ? (e as { id: string }).id.trim() : "";
        const name =
          typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name.trim() : "";
        if (id && name) employees.push({ id, name });
      }
    }
    const assignments: Record<string, string> = {};
    const ids = new Set(employees.map((e) => e.id));
    if (raw.assignments && typeof raw.assignments === "object") {
      for (const [code, empId] of Object.entries(raw.assignments as Record<string, unknown>)) {
        const c = code.toLowerCase().trim();
        if (!/^[a-z]{2}$/.test(c)) continue;
        if (typeof empId !== "string" || !empId.trim()) continue;
        if (!ids.has(empId.trim())) continue;
        assignments[c] = empId.trim();
      }
    }
    const priorityCountries: string[] = [];
    const seenPri = new Set<string>();
    if (Array.isArray(raw.priorityCountries)) {
      for (const x of raw.priorityCountries) {
        if (typeof x !== "string") continue;
        const c = x.toLowerCase().trim();
        if (!/^[a-z]{2}$/.test(c) || seenPri.has(c)) continue;
        seenPri.add(c);
        priorityCountries.push(c);
      }
    }
    return { employees, assignments, priorityCountries };
  } catch {
    return emptyEmployeesData();
  }
}

export function serializeEmployeesData(data: EmployeesData): string {
  return (
    JSON.stringify(
      {
        employees: data.employees,
        assignments: data.assignments,
        priorityCountries: data.priorityCountries ?? [],
      },
      null,
      2,
    ) + "\n"
  );
}

export function employeeNameByCountry(
  data: EmployeesData,
  countryCode: string,
): string | undefined {
  const empId = data.assignments[countryCode.toLowerCase()];
  if (!empId) return undefined;
  return data.employees.find((e) => e.id === empId)?.name;
}
