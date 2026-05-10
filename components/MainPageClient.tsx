"use client";

import { useState } from "react";
import { PageTabs } from "@/components/PageTabs";
import { CountrySearch } from "@/components/CountrySearch";
import type { Country } from "@/data/countries";

const TABS = [
  { id: "domains", label: "Рабочие домены" },
  { id: "teasers", label: "Проверенные тизеры" },
];

type Props = { countries: Country[] };

export function MainPageClient({ countries }: Props) {
  const [activeTab, setActiveTab] = useState("domains");

  return (
    <div>
      <PageTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      <p className="mb-6 mt-4 text-sm" style={{ color: "var(--muted)" }}>
        {activeTab === "domains"
          ? "Рабочий пул доменов — полная замена содержимого. Выберите страну."
          : "Проверенные домены с тизерами — только добавление и точечное удаление. Выберите страну."}
      </p>
      <CountrySearch
        countries={countries}
        linkSuffix={activeTab === "teasers" ? "?tab=teasers" : ""}
      />
    </div>
  );
}
