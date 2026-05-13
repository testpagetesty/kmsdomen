"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { PageTabs } from "@/components/PageTabs";
import { CountrySearch } from "@/components/CountrySearch";
import type { Country } from "@/data/countries";

/** Первая вкладка — тизеры, новые, пройденные */
const TABS = [
  { id: "teasers", label: "Домены с тизерами" },
  { id: "domains", label: "Новые домены" },
  { id: "passed", label: "Пройденные домены" },
];

function MainPageInner({ countries }: { countries: Country[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const section = searchParams.get("section");
  const activeTab =
    section === "teasers" ? "teasers" : section === "passed" ? "passed" : "domains";

  const handleTabChange = useCallback(
    (id: string) => {
      if (id === "teasers") {
        router.replace("/?section=teasers", { scroll: false });
      } else if (id === "passed") {
        router.replace("/?section=passed", { scroll: false });
      } else {
        router.replace("/", { scroll: false });
      }
    },
    [router],
  );

  const linkSuffix =
    activeTab === "teasers" ? "?tab=teasers" : activeTab === "passed" ? "?tab=passed" : "?tab=domains";

  return (
    <div>
      <PageTabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
      <p className="mb-6 mt-4 text-sm" style={{ color: "var(--muted)" }}>
        {activeTab === "domains"
          ? "Новые домены ежедневно загружаются для прохождения — редактируется весь файл целиком на GitHub. Отмечайте галочкой пройденные и переносите во вкладку «Пройденные». Выберите страну."
          : activeTab === "teasers"
            ? "Домены с тизерами — список проверенных; только добавление и точечное удаление. Выберите страну."
            : "Пройденные домены — перенос из «Новых» с датой отметки. Выберите страну."}
      </p>
      <CountrySearch countries={countries} linkSuffix={linkSuffix} />
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
