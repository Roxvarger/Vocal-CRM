import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM студии вокала",
  description: "Расписание, ученики, абонементы",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
