/** Нормализация для сравнения доменов между списками */
export function normalizeDomainLine(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  return s;
}

export function parseDomainLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}
