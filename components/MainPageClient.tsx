"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { PageTabs } from "@/components/PageTabs";
import { CountrySearch } from "@/components/CountrySearch";
import type { Country } from "@/data/countries";

/** Первая вкладка — тизеры, вторая — рабочие домены */
const TABS = [
  { id: "teasers", label: "Проверенные тизеры" },
  { id: "domains", label: "Рабочие домены" },
];

function MainPageInner({ countries }: { countries: Country[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /** По умолчанию — рабочие домены (вторая вкладка). Тизеры: ?section=teasers */
  const activeTab = searchParams.get("section") === "teasers" ? "teasers" : "domains";

  const handleTabChange = useCallback(
    (id: string) => {
      if (id === "teasers") {
        router.replace("/?section=teasers", { scroll: false });
      } else {
        router.replace("/", { scroll: false });
      }
    },
    [router],
  );

  return (
    <div>
      <PageTabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
      <p className="mb-6 mt-4 text-sm" style={{ color: "var(--muted)" }}>
        {activeTab === "domains"
          ? "Рабочий пул доменов — полная замена содержимого файла на GitHub. Выберите страну."
          : "Проверенные домены с тизерами — добавление и точечное удаление. Выберите страну."}
      </p>
      <CountrySearch
        countries={countries}
        linkSuffix={activeTab === "teasers" ? "?tab=teasers" : "?tab=domains"}
      />
    </div>
  );
}

type Props = { countries: Country[] };

export function MainPageClient({ countries }: Props) {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse rounded-xl py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
          Загрузка разделов…
        </div>
      }
    >
      <MainPageInner countries={countries} />
    </Suspense>
  );
}
