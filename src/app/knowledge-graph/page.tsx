"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KnowledgeTree, type TreeChapterData } from "@/components/knowledge/KnowledgeTree";
import { useOverview } from "@/lib/useOverview";
import { KP_STATUS, KP_STATUS_ORDER, type KpStatus } from "@/lib/kpStatus";

export default function KnowledgeGraphPage() {
  const { data, error, loading, reload } = useOverview();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<KpStatus[]>([...KP_STATUS_ORDER]);

  async function moveKp(kpId: string, sectionId: string) {
    try {
      const response = await fetch("/api/kp/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId, sectionId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "调整知识点归属失败");
      reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "调整知识点归属失败");
    }
  }

  const chapters: TreeChapterData[] = useMemo(
    () =>
      (data?.chapters || []).map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        sections: c.sections.map((s) => ({
          id: s.id,
          name: s.name,
          order: s.order,
          leaves: s.leaves.map((l) => ({
            id: l.id,
            name: l.name,
            status: l.status,
            questionCount: l.questionCount,
            difficulty: l.difficulty,
          })),
        })),
      })),
    [data]
  );

  if (error) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{error}</div>;
  }
  if (loading || !data) {
    return (
      <div className="glass flex h-[60vh] items-center justify-center rounded-2xl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight">知识图谱</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {data.totals.chapters} 章 · {data.totals.sections} 节 · {data.totals.kps} 个知识点 · 进度{" "}
            {data.totals.progress.toFixed(1)}%
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl border border-border bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-foreground/80 hover:bg-white"
        >
          返回总览
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="glass thin-scroll max-h-[calc(100vh-190px)] overflow-y-auto rounded-2xl p-2.5">
          <div className="px-1.5 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            章节定位
          </div>
          <button
            onClick={() => setFocusId(null)}
            className={`mb-1 w-full rounded-lg px-2 py-1.5 text-left text-[12.5px] transition ${
              focusId === null ? "bg-primary/10 font-medium text-primary" : "hover:bg-secondary/70"
            }`}
          >
            全树视图
          </button>
          {data.chapters.map((c) => (
            <button
              key={c.id}
              onClick={() => setFocusId(c.id)}
              className={`mb-1 w-full rounded-lg px-2 py-1.5 text-left transition ${
                focusId === c.id ? "bg-primary/10" : "hover:bg-secondary/70"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`truncate text-[12.5px] ${
                    focusId === c.id ? "font-medium text-primary" : ""
                  }`}
                >
                  {c.name.replace(/^[一二三四五六七八九十]+、/, "")}
                </span>
                <span className="num shrink-0 text-[10.5px] text-muted-foreground">
                  {c.progress.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-[rgba(120,145,200,.16)]">
                {KP_STATUS_ORDER.map((s) => {
                  const v = c.counts[s];
                  if (!v) return null;
                  return (
                    <div
                      key={s}
                      style={{ width: `${(v / c.leafCount) * 100}%`, background: KP_STATUS[s].color }}
                    />
                  );
                })}
              </div>
            </button>
          ))}
        </div>

        <div className="glass overflow-hidden rounded-2xl p-1.5">
          <div className="h-[calc(100vh-200px)] min-h-[520px]">
            <KnowledgeTree
              chapters={chapters}
              focusId={focusId}
              onFocus={setFocusId}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveKp={moveKp}
              activeStatuses={activeStatuses}
              onToggleStatus={(s) =>
                setActiveStatuses((prev) =>
                  prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                )
              }
              onResetStatuses={() => setActiveStatuses([...KP_STATUS_ORDER])}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
