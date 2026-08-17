"use client";

import { useRouter } from "next/navigation";

type Props = {
  /** Fallback, если истории назад нет */
  fallbackHref?: string;
  label?: string;
  className?: string;
};

export function BackLink({
  fallbackHref = "/",
  label = "← Назад",
  className = "text-blue-400 hover:text-blue-300",
}: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
      className={className}
    >
      {label}
    </button>
  );
}
