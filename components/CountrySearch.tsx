"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Country } from "@/data/countries";

type Props = { countries: Country[] };

export function CountrySearch({ countries }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.nameRu.toLowerCase().includes(q) ||
        c.code.includes(q),
    );
  }, [countries, query]);

  function handleDropdownChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value;
    setSelected(code);
    if (code) {
      router.push(`/country/${code}`);
    }
  }

  return (
    <div>
      {/* Выпадающий список */}
      <label htmlFor="country-select" className="mb-2 block text-sm font-medium" style={{ color: "var(--muted)" }}>
        Быстрый выбор страны
      </label>
      <select
        id="country-select"
        value={selected}
        onChange={handleDropdownChange}
        className="mb-6 w-full cursor-pointer rounded-lg border bg-[var(--card)] px-4 py-3 text-white outline-none focus:border-[var(--accent)] appearance-none"
        style={{ borderColor: "var(--border)" }}
      >
        <option value="" disabled style={{ color: "#8b9cae" }}>
          — выберите страну из списка —
        </option>
        {countries.map((c) => (
          <option key={c.code} value={c.code} style={{ background: "#1a2332" }}>
            {c.nameRu} ({c.code.toUpperCase()})
          </option>
        ))}
      </select>

      {/* Разделитель */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
        <span className="text-xs" style={{ color: "var(--muted)" }}>или найдите по названию</span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>

      {/* Текстовый поиск */}
      <label htmlFor="country-filter" className="mb-2 block text-sm font-medium" style={{ color: "var(--muted)" }}>
        Поиск по названию или коду
      </label>
      <input
        id="country-filter"
        type="search"
        autoComplete="off"
        placeholder="Например: Германия или de"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 w-full rounded-lg border bg-[var(--card)] px-4 py-3 text-white placeholder:text-gray-500 outline-none focus:border-[var(--accent)]"
        style={{ borderColor: "var(--border)" }}
      />

      {/* Сетка стран */}
      {query.trim() !== "" && (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {filtered.map((c) => (
              <li key={c.code}>
                <Link
                  href={`/country/${c.code}`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 transition hover:border-[var(--accent)] hover:bg-white/5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span>{c.nameRu}</span>
                  <span className="font-mono text-xs uppercase" style={{ color: "var(--muted)" }}>
                    {c.code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              Ничего не найдено.
            </p>
          ) : (
            <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>
              Найдено: {filtered.length} из {countries.length}
            </p>
          )}
        </>
      )}

      {/* Если поиск не введён — показать полную сетку */}
      {query.trim() === "" && (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {countries.map((c) => (
              <li key={c.code}>
                <Link
                  href={`/country/${c.code}`}
                  prefetch={false}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 transition hover:border-[var(--accent)] hover:bg-white/5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span>{c.nameRu}</span>
                  <span className="font-mono text-xs uppercase" style={{ color: "var(--muted)" }}>
                    {c.code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>
            Всего стран: {countries.length}
          </p>
        </>
      )}
    </div>
  );
}
