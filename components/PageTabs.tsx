"use client";

export type TabItem = { id: string; label: string; badge?: number };

type Props = {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: "sm" | "md";
};

export function PageTabs({ tabs, activeId, onChange, size = "md" }: Props) {
  const py = size === "sm" ? "py-2" : "py-2.5";
  return (
    <div
      className="flex gap-1 rounded-xl p-1"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 ${py} text-sm font-medium transition-all ${
              active
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  active ? "bg-white/25 text-white" : "bg-white/10 text-gray-400"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
