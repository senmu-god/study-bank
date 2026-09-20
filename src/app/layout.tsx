import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "智能题库与组卷系统",
  description: "个人自用 AI 题库、组卷与错题复习系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 md:pl-60 pb-16 md:pb-0">
            <div className="mx-auto max-w-5xl p-4 md:p-8">{children}</div>
          </main>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
