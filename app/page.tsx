import Link from "next/link";
import { COUNTRIES } from "@/data/countries";
import { CountrySearch } from "@/components/CountrySearch";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Домены по странам</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Выберите страну, чтобы открыть список доменов. После сохранения обновляется файл{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{`{код}.txt`}</code> в репозитории
          на GitHub.
        </p>
      </header>
      <CountrySearch countries={COUNTRIES} />
      <p className="mt-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        <Link href="/country/ru" className="underline underline-offset-2 hover:text-white">
          Открыть Россию (пример)
        </Link>
      </p>
    </div>
  );
}
