import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isKnownCountryCode } from "@/data/countries";
import { getAdminPassword, resolveEmployeesPath } from "@/lib/env";
import {
  emptyEmployeesData,
  parseEmployeesJson,
  serializeEmployeesData,
  type Employee,
  type EmployeesData,
} from "@/lib/employees";
import { fetchRepoFile, putRepoFile } from "@/lib/github";

export const dynamic = "force-dynamic";

function checkWriteAuth(request: NextRequest): NextResponse | null {
  const secret = getAdminPassword();
  if (!secret) return null;
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m?.[1]?.trim() !== secret) {
    return NextResponse.json(
      { error: "Нужен пароль администратора (заголовок Authorization: Bearer)." },
      { status: 401 },
    );
  }
  return null;
}

function normalizePayload(body: unknown): EmployeesData | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Ожидается JSON-объект" };
  }
  const b = body as { employees?: unknown; assignments?: unknown };
  if (!Array.isArray(b.employees)) {
    return { error: "Ожидается поле employees: { id, name }[]" };
  }

  const employees: Employee[] = [];
  const seenIds = new Set<string>();
  for (const e of b.employees) {
    if (!e || typeof e !== "object") continue;
    const id = typeof (e as { id?: unknown }).id === "string" ? (e as { id: string }).id.trim() : "";
    const name =
      typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name.trim() : "";
    if (!id || !name) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    employees.push({ id, name });
  }

  const assignments: Record<string, string> = {};
  if (b.assignments && typeof b.assignments === "object") {
    for (const [code, empId] of Object.entries(b.assignments as Record<string, unknown>)) {
      const c = code.toLowerCase().trim();
      if (!isKnownCountryCode(c)) continue;
      if (typeof empId !== "string" || !empId.trim()) continue;
      if (!seenIds.has(empId.trim())) continue;
      assignments[c] = empId.trim();
    }
  }

  return { employees, assignments };
}

/** GET /api/employees → { employees, assignments } */
export async function GET() {
  try {
    const path = resolveEmployeesPath();
    const { text } = await fetchRepoFile(path);
    const data = text.trim() ? parseEmployeesJson(text) : emptyEmployeesData();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка загрузки" },
      { status: 500 },
    );
  }
}

/** PUT /api/employees — сохранить список сотрудников и закрепления стран */
export async function PUT(request: NextRequest) {
  const denied = checkWriteAuth(request);
  if (denied) return denied;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
    }

    const normalized = normalizePayload(body);
    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const path = resolveEmployeesPath();
    const { sha } = await fetchRepoFile(path);
    await putRepoFile(path, serializeEmployeesData(normalized), sha || undefined);

    return NextResponse.json({ ok: true, ...normalized });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка сохранения" },
      { status: 500 },
    );
  }
}
