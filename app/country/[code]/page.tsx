import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountryByCode } from "@/data/countries";
import { CountryPageTabs } from "@/components/CountryPageTabs";
import { resolveDomainsPrefix, resolveTeasersPrefix, countryFilePath } from "@/lib/env";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function CountryPage(props: Props) {
  const { code: raw } = await props.params;
  const { tab } = await props.searchParams;

  const code = raw?.toLowerCase().trim();
  const country = code ? getCountryByCode(code) : undefined;
  if (!country) notFound();

  const domainsFile = countryFilePath(resolveDomainsPrefix(), country.code);
  const teasersFile = countryFilePath(resolveTeasersPrefix(), country.code);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-6 text-sm">
        <Link
          href={tab === "teasers" ? "/?section=teasers" : "/"}
          className="text-blue-400 hover:text-blue-300"
          prefetch={false}
        >
          ← К списку стран
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{country.nameRu}</h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            <span className="font-medium text-gray-400">Новые домены:</span>{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">{domainsFile}</code>
            {"  "}
            <span className="font-medium text-gray-400">Домены с тизерами:</span>{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">{teasersFile}</code>
          </p>
        </div>
      </header>

      <CountryPageTabs
        countryCode={country.code}
        initialTab={tab === "teasers" ? "teasers" : "domains"}
      />
    </div>
  );
}
