"use client";

import { useState } from "react";
import { PageTabs } from "@/components/PageTabs";
import { DomainEditor } from "@/components/DomainEditor";
import { PassedDomainsEditor } from "@/components/PassedDomainsEditor";
import { TeaserEditor } from "@/components/TeaserEditor";

/** Порядок: тизеры → новые → пройденные */
const TABS = [
  { id: "teasers", label: "Домены с тизерами" },
  { id: "domains", label: "Новые домены" },
  { id: "passed", label: "Пройденные домены" },
];

type Props = { countryCode: string; initialTab?: string };

function tabFromInitial(initialTab: string | undefined): string {
  if (initialTab === "teasers") return "teasers";
  if (initialTab === "passed") return "passed";
  return "domains";
}

export function CountryPageTabs({ countryCode, initialTab = "domains" }: Props) {
  const [activeTab, setActiveTab] = useState<string>(() => tabFromInitial(initialTab));
  const [passedRefreshKey, setPassedRefreshKey] = useState(0);

  return (
    <div>
      <PageTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === "domains" ? (
          <DomainEditor
            countryCode={countryCode}
            onPassedChange={() => setPassedRefreshKey((k) => k + 1)}
          />
        ) : activeTab === "teasers" ? (
          <TeaserEditor countryCode={countryCode} />
        ) : (
          <PassedDomainsEditor key={passedRefreshKey} countryCode={countryCode} />
        )}
      </div>
    </div>
  );
}
