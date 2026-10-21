"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GraduationCap,
  Network,
  CalendarClock,
  Database,
  Settings,
  BookOpen,
  Upload,
  Sparkles,
  Layers,
  FilePlus2,
  Files,
  BookmarkX,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string }>;
  /** 精确匹配（用于 / 与 /knowledge 这类前缀重叠的情况） */
  exact?: boolean;
}

const MAIN: NavItem[] = [
  { href: "/", label: "首页", icon: LayoutDashboard, exact: true },
  { href: "/learning", label: "学习中心", icon: GraduationCap },
  { href: "/knowledge-graph", label: "知识图谱", icon: Network },
  { href: "/plan", label: "学习计划", icon: CalendarClock },
  { href: "/data", label: "数据管理", icon: Database },
  { href: "/settings", label: "设置", icon: Settings },
];

const BANK: NavItem[] = [
  { href: "/knowledge", label: "知识点", icon: BookOpen, exact: true },
  { href: "/knowledge/import", label: "批量导入", icon: Upload },
  { href: "/generate", label: "AI 生成题目", icon: Sparkles },
  { href: "/questions", label: "题库", icon: Layers },
  { href: "/create-paper", label: "组卷", icon: FilePlus2 },
  { href: "/papers", label: "我的试卷", icon: Files },
  { href: "/wrong-answers", label: "错题本", icon: BookmarkX },
  { href: "/mock-exams", label: "模考记录", icon: ClipboardList },
];

const BANK_PREFIX = ["/knowledge/", "/generate", "/questions", "/create-paper", "/papers", "/wrong-answers", "/mock-exams", "/exam", "/paper", "/results", "/knowledge"];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function inBank(pathname: string): boolean {
  return BANK_PREFIX.some((p) => pathname === p || pathname.startsWith(p));
}

export function Sidebar() {
  const pathname = usePathname();
  const [openBank, setOpenBank] = useState(true);

  useEffect(() => {
    if (inBank(pathname)) setOpenBank(true);
  }, [pathname]);

  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/70 bg-white/70 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-[#7c5cff] to-[#22d3ee] text-white shadow-[0_8px_20px_-8px_rgba(79,107,255,.9)]">
          <BookOpen size={17} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold leading-tight">高数学习台</span>
          <span className="block text-[10.5px] text-muted-foreground">题库 · 知识漏洞闭环</span>
        </span>
      </div>

      <nav className="thin-scroll flex-1 overflow-y-auto px-3 pb-4">
        <div className="mt-1 space-y-0.5">
          {MAIN.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-xl px-3 py-[7px] text-[13px] transition",
                  active
                    ? "bg-primary/[0.09] font-medium text-primary"
                    : "text-foreground/70 hover:bg-secondary/70 hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <item.icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-4">
          <button
            onClick={() => setOpenBank((v) => !v)}
            className="flex w-full items-center justify-between px-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80"
          >
            题库
            <ChevronDown
              size={13}
              className={cn("transition-transform", openBank ? "" : "-rotate-90")}
            />
          </button>
          {openBank && (
            <div className="space-y-0.5">
              {BANK.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-xl px-3 py-[7px] text-[13px] transition",
                      active
                        ? "bg-primary/[0.09] font-medium text-primary"
                        : "text-foreground/70 hover:bg-secondary/70 hover:text-foreground"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <item.icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-border/70 px-4 py-3">
        <div className="rounded-xl bg-gradient-to-br from-primary/[0.08] to-[#22d3ee]/[0.08] px-3 py-2">
          <div className="text-[11px] font-medium">个人自用</div>
          <div className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground">
            数据仅本人可见，密钥只存服务端
          </div>
        </div>
      </div>
    </aside>
  );
}

const MOBILE: NavItem[] = [
  { href: "/", label: "首页", icon: LayoutDashboard, exact: true },
  { href: "/learning", label: "学习", icon: GraduationCap },
  { href: "/knowledge-graph", label: "图谱", icon: Network },
  { href: "/questions", label: "题库", icon: Layers },
  { href: "/data", label: "数据", icon: Database },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed bottom-0 left-0 right-0 z-30 flex border-t border-border/70 bg-white/85 backdrop-blur-xl md:hidden">
      {MOBILE.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
