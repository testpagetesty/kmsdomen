import { COUNTRIES } from "@/data/countries";
import { MainPageClient } from "@/components/MainPageClient";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Домены по странам</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Два раздела: рабочий пул и проверенные тизеры. Файлы хранятся на GitHub.
        </p>
      </header>
      <MainPageClient countries={COUNTRIES} />
    </div>
  );
}
