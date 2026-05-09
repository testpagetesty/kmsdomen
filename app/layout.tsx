import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Домены по странам — kmsdomen",
  description: "Редактирование списков доменов по странам на GitHub",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="font-sans">{children}</body>
    </html>
  );
}
