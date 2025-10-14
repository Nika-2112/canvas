import "./globals.css";
import type { ReactNode } from "react";
import SessionWrapper from "@/components/SessionWrapper";
import SidebarDrawer from "@/components/SidebarDrawer";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-white text-black">
        <SessionWrapper>
          {/* Кнопка + слой выезжающего меню.
             Передаём свою иконку через проп menuIcon (вариант Б): */}
          <SidebarDrawer menuIcon={<img src="/menu.svg" alt="menu" width={18} height={18} />} />

          {/* Основная область */}
          <main className="min-h-screen">{children}</main>
        </SessionWrapper>
      </body>
    </html>
  );
}
