"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { PageTabs } from "@/components/PageTabs";
import { CountrySearch } from "@/components/CountrySearch";
import type { Country } from "@/data/countries";

/** Первая вкладка — домены с тизерами, вторая — новые домены */
const TABS = [
  { id: "teasers", label: "Домены с тизерами" },
  { id: "domains", label: "Новые домены" },
];

function MainPageInner({ countries }: { countries: Country[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /** По умолчанию — новые домены (вторая вкладка). Домены с тизерами: ?section=teasers */
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
          ? "Новые домены ежедневно загружаются для прохождения — редактируется весь файл целиком на GitHub. Выберите страну."
          : "Домены с тизерами — список проверенных; только добавление и точечное удаление. Выберите страну."}
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
