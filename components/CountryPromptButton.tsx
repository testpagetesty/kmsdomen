"use client";

import { useCallback, useEffect, useState } from "react";
import { getGeoMeta } from "@/data/geoMeta";
import { buildPlacementPrompt } from "@/lib/placementPrompt";

type Props = {
  countryCode: string;
  countryNameRu: string;
};

export function CountryPromptButton({ countryCode, countryNameRu }: Props) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exemplarsNote, setExemplarsNote] = useState("");

  const meta = getGeoMeta(countryCode);

  const loadAndOpen = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setCopied(false);
    try {
      const res = await fetch(`/api/teasers/${countryCode}`, { cache: "no-store" });
      const data = (await res.json()) as { lines?: string[] };
      const exemplars = (data.lines ?? []).slice(0, 3);
      setExemplarsNote(
        exemplars.length > 0
          ? `Эталоны из тизеров: ${exemplars.join(", ")}`
          : "Эталонов в тизерах нет — в промпте EXEMPLARS пустые",
      );
      setPrompt(buildPlacementPrompt({ countryCode, exemplars }));
    } catch {
      setExemplarsNote("Не удалось загрузить тизеры — EXEMPLARS пустые");
      setPrompt(buildPlacementPrompt({ countryCode, exemplars: [] }));
    } finally {
      setLoading(false);
    }
  }, [countryCode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select textarea
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={loadAndOpen}
        className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-white transition hover:border-[var(--accent)] hover:bg-white/5"
        style={{ borderColor: "var(--border)" }}
        title="Скопировать промпт для подбора placements"
      >
        Промпт
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl"
            style={{ borderColor: "var(--border)", background: "#0f1419" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Промпт placements"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Промпт · {countryNameRu}
                </h3>
                <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  GEO: {meta.geoEn} · {meta.language} · {meta.domainHint}
                </p>
                {!loading && (
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
                    {exemplarsNote}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-xs hover:bg-white/10"
                style={{ color: "var(--muted)" }}
              >
                Закрыть
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <p className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  Собираю промпт…
                </p>
              ) : (
                <textarea
                  readOnly
                  value={prompt}
                  rows={18}
                  className="w-full resize-y rounded-lg border bg-[#0d1117] px-3 py-2 font-mono text-xs leading-relaxed text-gray-200 outline-none"
                  style={{ borderColor: "var(--border)", minHeight: "280px" }}
                  onFocus={(e) => e.target.select()}
                />
              )}
            </div>

            <div
              className="flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={copyPrompt}
                disabled={loading || !prompt}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {copied ? "Скопировано ✓" : "Скопировать промпт"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
