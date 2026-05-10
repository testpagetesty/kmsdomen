"use client";

import { useState } from "react";
import { PageTabs } from "@/components/PageTabs";
import { DomainEditor } from "@/components/DomainEditor";
import { TeaserEditor } from "@/components/TeaserEditor";

/** Порядок как на главной: сначала тизеры, затем рабочие домены */
const TABS = [
  { id: "teasers", label: "Проверенные тизеры" },
  { id: "domains", label: "Рабочие домены" },
];

type Props = { countryCode: string; initialTab?: string };

export function CountryPageTabs({ countryCode, initialTab = "domains" }: Props) {
  const [activeTab, setActiveTab] = useState<string>(
    initialTab === "teasers" ? "teasers" : "domains",
  );

  return (
    <div>
      <PageTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "domains" ? (
          <DomainEditor countryCode={countryCode} />
        ) : (
          <TeaserEditor countryCode={countryCode} />
        )}
      </div>
    </div>
  );
}
