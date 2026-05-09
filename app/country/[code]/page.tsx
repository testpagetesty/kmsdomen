import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountryByCode } from "@/data/countries";
import { DomainEditor } from "@/components/DomainEditor";

type Props = { params: Promise<{ code: string }> };

export default async function CountryPage(props: Props) {
  const { code: raw } = await props.params;
  const code = raw?.toLowerCase().trim();
  const country = code ? getCountryByCode(code) : undefined;
  if (!country) notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav className="mb-6 text-sm">
        <Link href="/" className="text-blue-400 hover:text-blue-300" prefetch={false}>
          ← К списку стран
        </Link>
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-white">{country.nameRu}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Файл в репозитории: <code className="rounded bg-white/10 px-1.5 py-0.5">{`${country.code}.txt`}</code>
        </p>
      </header>
      <DomainEditor countryCode={country.code} />
    </div>
  );
}
