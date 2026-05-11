export type VerticalId = "all" | "nutra" | "crypt" | "news" | "gambling" | "vsl" | "other";

export type VerticalOption = { id: VerticalId; label: string };

export const VERTICALS: VerticalOption[] = [
  { id: "all", label: "Все" },
  { id: "nutra", label: "Nutra" },
  { id: "crypt", label: "Crypt" },
  { id: "news", label: "News" },
  { id: "gambling", label: "Gambling" },
  { id: "vsl", label: "VSL" },
  { id: "other", label: "Другое" },
];

export function isVerticalId(v: unknown): v is Exclude<VerticalId, "all"> {
  return v === "nutra" || v === "crypt" || v === "news" || v === "gambling" || v === "vsl" || v === "other";
}

