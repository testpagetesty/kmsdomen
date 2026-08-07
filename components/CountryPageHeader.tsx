"use client";

import { Suspense } from "react";
import { CountrySwitcher } from "@/components/CountrySwitcher";
import { CountryPromptButton } from "@/components/CountryPromptButton";

type Props = {
  countryCode: string;
  countryNameRu: string;
  employeeName?: string;
};

function HeaderInner({ countryCode, countryNameRu, employeeName }: Props) {
  return (
    <header className="mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white">{countryNameRu}</h1>
            {employeeName && (
              <span
                className="rounded-full border px-3 py-1 text-xs font-medium text-blue-300"
                style={{ borderColor: "rgba(59,130,246,.35)", background: "rgba(59,130,246,.12)" }}
              >
                Сотрудник: {employeeName}
              </span>
            )}
            <CountryPromptButton countryCode={countryCode} countryNameRu={countryNameRu} />
          </div>
        </div>
        <CountrySwitcher currentCode={countryCode} />
      </div>
    </header>
  );
}

export function CountryPageHeader(props: Props) {
  return (
    <Suspense
      fallback={
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-white">{props.countryNameRu}</h1>
        </header>
      }
    >
      <HeaderInner {...props} />
    </Suspense>
  );
}
