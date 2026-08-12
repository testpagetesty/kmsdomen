/** Нормализация для сравнения доменов между списками */
export function normalizeDomainLine(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.replace(/\/+$/, "");
  // если передали path — берём хост
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  return s;
}

export function parseDomainLines(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Отсекает JSON-ответы API и прочий мусор вместо hostname */
export function isPlausibleDomain(raw: string): boolean {
  const s = normalizeDomainLine(raw);
  if (!s || s.length > 253) return false;
  if (s.startsWith("{") || s.startsWith("[") || s.includes('"') || s.includes(":")) return false;
  if (s.includes(" ") || s.includes("\\")) return false;
  // hostname: labels.tld
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(s);
}
