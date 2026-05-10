"use client";

export type TabItem = { id: string; label: string; badge?: number };

type Props = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
};

export function PageTabs({ tabs, activeId, onChange, size = "md" }: Props) {
  const py = size === "sm" ? "py-2.5" : "py-3";
  return (
    <div className="w-full">
      <div
        className="grid w-full gap-0 overflow-hidden rounded-xl sm:grid-flow-col sm:auto-cols-fr"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          border: "2px solid rgba(59, 130, 246, 0.35)",
          background: "rgba(26, 35, 50, 0.95)",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.35)",
        }}
        role="tablist"
        aria-label="Разделы списков"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={`relative min-w-0 border-b sm:border-b-0 sm:border-r sm:last:border-r-0 ${py} px-2 text-center text-sm font-semibold leading-tight transition-all sm:px-3 ${
                active
                  ? "z-[1] bg-[var(--accent)] text-white"
                  : "bg-[#0f1419] text-gray-200 hover:bg-white/10"
              }`}
              style={{
                borderColor: "var(--border)",
              }}
            >
              <span className="line-clamp-2">{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    active ? "bg-white/25 text-white" : "bg-white/15 text-gray-300"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        Два раздела — переключите вкладку выше
      </p>
    </div>
  );
}
