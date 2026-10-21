import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "高数学习台 · 题库与知识漏洞闭环",
  description: "个人自用的高等数学题库、知识树、AI 诊断与掌握管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 pb-16 md:pb-0 md:pl-60">
            <div className="mx-auto w-full max-w-[1440px] p-4 md:px-6 md:py-6">{children}</div>
          </main>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
