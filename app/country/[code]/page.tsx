import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountryByCode } from "@/data/countries";
import { CountryPageTabs } from "@/components/CountryPageTabs";
import {
  resolveDomainsPrefix,
  resolveTeasersPrefix,
  resolvePassedDomainsPrefix,
  resolveEmployeesPath,
  countryFilePath,
  countryJsonFilePath,
} from "@/lib/env";
import { employeeNameByCountry, parseEmployeesJson } from "@/lib/employees";
import { fetchRepoFile } from "@/lib/github";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function tabFromSearch(tab: string | undefined): string | undefined {
  if (tab === "teasers" || tab === "passed") return tab;
  return undefined;
}

export default async function CountryPage(props: Props) {
  const { code: raw } = await props.params;
  const { tab } = await props.searchParams;

  const code = raw?.toLowerCase().trim();
  const country = code ? getCountryByCode(code) : undefined;
  if (!country) notFound();

  const domainsFile = countryFilePath(resolveDomainsPrefix(), country.code);
  const teasersFile = countryFilePath(resolveTeasersPrefix(), country.code);
  const passedFile = countryJsonFilePath(resolvePassedDomainsPrefix(), country.code);

  let employeeName: string | undefined;
  try {
    const { text } = await fetchRepoFile(resolveEmployeesPath());
    employeeName = employeeNameByCountry(parseEmployeesJson(text), country.code);
  } catch {
    employeeName = undefined;
  }

  const initialTab = tabFromSearch(tab);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-6 text-sm">
        <Link
          href={
            initialTab === "teasers"
              ? "/?section=teasers"
              : initialTab === "passed"
                ? "/?section=passed"
                : "/"
          }
          className="text-blue-400 hover:text-blue-300"
          prefetch={false}
        >
          ← К списку стран
        </Link>
      </nav>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{country.nameRu}</h1>
            {employeeName && (
              <span
                className="rounded-full border px-3 py-1 text-xs font-medium text-blue-300"
                style={{ borderColor: "rgba(59,130,246,.35)", background: "rgba(59,130,246,.12)" }}
              >
                Сотрудник: {employeeName}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            <span className="font-medium text-gray-400">Новые домены:</span>{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">{domainsFile}</code>
            {"  "}
            <span className="font-medium text-gray-400">Домены с тизерами:</span>{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">{teasersFile}</code>
            {"  "}
            <span className="font-medium text-gray-400">Пройденные:</span>{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">{passedFile}</code>
          </p>
        </div>
      </header>

      <CountryPageTabs countryCode={country.code} initialTab={initialTab} />
    </div>
  );
}
