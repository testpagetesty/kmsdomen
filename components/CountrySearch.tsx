"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Country } from "@/data/countries";

type Props = { countries: Country[] };

export function CountrySearch({ countries }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.nameRu.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.nameRu.toLowerCase().startsWith(q),
    );
  }, [countries, query]);

  return (
    <div>
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
          Показано {filtered.length} из {countries.length}
        </p>
      )}
    </div>
  );
}
