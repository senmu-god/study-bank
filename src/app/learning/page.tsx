"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Filter, Search } from "lucide-react";
import { TeachingPanel } from "@/components/knowledge/TeachingPanel";
import { NotesPanel } from "@/components/knowledge/NotesPanel";
import { SupplementDraftPanel } from "@/components/knowledge/SupplementDraftPanel";
import { useOverview, type OverviewLeaf, type OverviewChapter } from "@/lib/useOverview";
import { KP_STATUS, KP_STATUS_ORDER, type KpStatus } from "@/lib/kpStatus";

type Tab = "gaps" | "tests" | "notes" | "records";

interface LearningRecord {
  id: string;
  kp_id: string;
  type: string;
  title: string;
  detail: string | null;
  created_at: string;
  knowledge_point: string;
}

const RECORD_LABELS: Record<string, string> = {
  diagnosis: "诊断",
  teaching: "学习",
  test: "测试",
  review: "复习",
  status: "状态变更",
  move: "归属调整",
};

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "gaps", label: "知识漏洞", hint: "未掌握 / 待确认 / 学习中" },
  { key: "tests", label: "专项测试", hint: "按知识点出卷" },
  { key: "notes", label: "笔记本", hint: "知识库与摘录" },
  { key: "records", label: "学习记录", hint: "诊断、教学、测试流水" },
];

export default function LearningPage() {
  return (
    <Suspense
      fallback={
        <div className="glass flex h-[50vh] items-center justify-center rounded-2xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        </div>
      }
    >
      <LearningInner />
    </Suspense>
  );
}

function LearningInner() {
  const params = useSearchParams();
  const initialTab = (params.get("tab") as Tab) || "gaps";
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === initialTab) ? initialTab : "gaps"
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<KpStatus[]>([
    "not_mastered",
    "pending",
    "learning",
  ]);
  const [creatingTestFor, setCreatingTestFor] = useState<string | null>(null);
  const [testError, setTestError] = useState("");
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const { data, error, loading } = useOverview();

  useEffect(() => {
    if (tab !== "records") return;
    const controller = new AbortController();
    setRecordsLoading(true);
    setRecordsError("");
    fetch("/api/kp/records", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "学习记录加载失败");
        setRecords(result.records || []);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRecordsError(e instanceof Error ? e.message : "学习记录加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecordsLoading(false);
      });
    return () => controller.abort();
  }, [tab]);

  const allRows = useMemo(() => {
    if (!data) return [] as { chapter: OverviewChapter; leaf: OverviewLeaf; sectionName: string }[];
    const out: { chapter: OverviewChapter; leaf: OverviewLeaf; sectionName: string }[] = [];
    for (const chapter of data.chapters) {
      for (const section of chapter.sections) {
        for (const leaf of section.leaves) out.push({ chapter, leaf, sectionName: section.name });
      }
    }
    return out;
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [] as { chapter: OverviewChapter; leaf: OverviewLeaf; sectionName: string }[];
    const out: { chapter: OverviewChapter; leaf: OverviewLeaf; sectionName: string }[] = [];
    for (const c of data.chapters) {
      for (const s of c.sections) {
        for (const l of s.leaves) {
          if (!statusFilter.includes(l.status)) continue;
          if (query && !l.name.includes(query)) continue;
          out.push({ chapter: c, leaf: l, sectionName: s.name });
        }
      }
    }
    const rank: Record<KpStatus, number> = {
      not_mastered: 0,
      pending: 1,
      learning: 2,
      mastered: 3,
      new: 4,
    };
    return out.sort((a, b) => rank[a.leaf.status] - rank[b.leaf.status]);
  }, [data, query, statusFilter]);

  const testRows = useMemo(() => {
    const selectedId = params.get("kp");
    const filtered = allRows.filter(({ leaf }) => {
      if (selectedId && leaf.id !== selectedId) return false;
      return !query || leaf.name.includes(query);
    });
    const rank: Record<KpStatus, number> = {
      not_mastered: 0,
      pending: 1,
      learning: 2,
      new: 3,
      mastered: 4,
    };
    return filtered.sort((a, b) => rank[a.leaf.status] - rank[b.leaf.status]);
  }, [allRows, params, query]);

  const teachingId = params.get("mode") === "teach" ? params.get("kp") : null;
  const teachingTarget = teachingId ? allRows.find(({ leaf }) => leaf.id === teachingId) : null;

  async function createTest(kpId: string, kind: "initial" | "retest") {
    setCreatingTestFor(kpId);
    setTestError("");
    try {
      const response = await fetch("/api/kp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpId, kind, count: 5 }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.href) {
        throw new Error(result.error || "创建专项测试失败");
      }
      window.location.assign(result.href);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "创建专项测试失败");
      setCreatingTestFor(null);
    }
  }

  if (error) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{error}</div>;
  }
  if (loading || !data) {
    return (
      <div className="glass flex h-[50vh] items-center justify-center rounded-2xl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold leading-tight">学习中心</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            以知识点为单位管理漏洞、测试与记录
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索知识点"
              className="w-44 rounded-xl border border-border bg-white/70 py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none placeholder:text-muted-foreground/70 focus:border-primary/50"
            />
          </div>
        </div>
      </div>

      <div className="glass flex flex-wrap gap-1 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-[12.5px] transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-10px_rgba(79,107,255,.9)]"
                : "text-foreground/70 hover:bg-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "gaps" && (
        <>
          <div className="glass flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
            <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <Filter size={12} /> 状态
            </span>
            {KP_STATUS_ORDER.map((s) => {
              const on = statusFilter.includes(s);
              return (
                <button
                  key={s}
                  onClick={() =>
                    setStatusFilter((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                    )
                  }
                  className="kp-chip transition"
                  style={{
                    background: on ? KP_STATUS[s].soft : "transparent",
                    borderColor: on ? KP_STATUS[s].border : "rgba(150,172,220,.3)",
                    color: on ? KP_STATUS[s].ink : "#8d9ab3",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: on ? KP_STATUS[s].color : "#b6c1d4" }}
                  />
                  {KP_STATUS[s].short}
                </button>
              );
            })}
            <span className="ml-auto text-[11.5px] text-muted-foreground">
              共 {rows.length} 个
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                当前筛选下没有知识点。全部 {data.totals.kps} 个知识点都还是「未学习」。
              </p>
              <p className="mt-1.5 text-[12px] text-muted-foreground/80">
                完成一次专项测试或诊断后，漏洞会自动出现在这里。
              </p>
              <Link
                href="/"
                className="mt-3 inline-block rounded-xl bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground"
              >
                去知识树选一个章节
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.slice(0, 120).map(({ chapter, leaf, sectionName }) => {
                const meta = KP_STATUS[leaf.status];
                return (
                  <div
                    key={leaf.id}
                    className="glass flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{leaf.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {chapter.name.replace(/^[一二三四五六七八九十]+、/, "")} · {sectionName}
                      </div>
                    </div>
                    <span className="num shrink-0 text-[11.5px] text-muted-foreground">
                      {leaf.questionCount} 题
                    </span>
                    <span
                      className="kp-chip shrink-0"
                      style={{ background: meta.soft, borderColor: meta.border, color: meta.ink }}
                    >
                      {meta.label}
                    </span>
                    <Link
                      href={`/learning?tab=gaps&kp=${encodeURIComponent(leaf.id)}&mode=teach`}
                      className="shrink-0 rounded-lg border border-border bg-white/70 px-2.5 py-1.5 text-[11.5px] font-medium text-primary hover:bg-white"
                    >
                      开始学习
                    </Link>
                  </div>
                );
              })}
              {rows.length > 120 && (
                <p className="pt-1 text-center text-[11.5px] text-muted-foreground">
                  仅显示前 120 条，共 {rows.length} 条
                </p>
              )}
            </div>
          )}
        </>
      )}

      {tab === "gaps" && teachingId && (
        teachingTarget ? (
          <TeachingPanel kpId={teachingTarget.leaf.id} kpName={teachingTarget.leaf.name} />
        ) : (
          <div role="alert" className="glass rounded-xl p-4 text-[12.5px] text-muted-foreground">
            找不到要学习的知识点。它可能已被移除，或当前知识点数据尚未加载完整。
          </div>
        )
      )}

      {tab === "tests" && (
        <section className="space-y-2">
          <div className="glass rounded-xl px-3.5 py-2.5 text-[12px] text-muted-foreground">
            从现有题库抽取最多 5 道相关题目，复用原有答题、判分和错题记录流程。
            已掌握知识点会作为复测创建。
          </div>
          {testError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
              {testError}
            </div>
          )}
          {testRows.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-[12.5px] text-muted-foreground">
              {params.get("kp") ? "没有找到这个知识点，或它已不在当前数据中。" : "没有找到匹配的知识点。"}
            </div>
          ) : (
            testRows.map(({ chapter, leaf, sectionName }) => {
              const meta = KP_STATUS[leaf.status];
              const isRetest = leaf.status === "mastered";
              const busy = creatingTestFor === leaf.id;
              return (
                <div key={leaf.id} className="glass flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{leaf.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {chapter.name.replace(/^[一二三四五六七八九十]+、/, "")} · {sectionName} · {leaf.questionCount} 道相关题
                    </div>
                  </div>
                  <span className="kp-chip shrink-0" style={{ background: meta.soft, borderColor: meta.border, color: meta.ink }}>
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    disabled={busy || creatingTestFor !== null || leaf.questionCount === 0}
                    onClick={() => void createTest(leaf.id, isRetest ? "retest" : "initial")}
                    title={leaf.questionCount === 0 ? "该知识点目前没有关联题目" : undefined}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "正在组卷…" : isRetest ? "开始复测" : "开始测试"}
                    {!busy && <ArrowRight size={12} />}
                  </button>
                  {leaf.questionCount < 5 && <SupplementDraftPanel kpId={leaf.id} kpName={leaf.name} questionCount={leaf.questionCount} onDone={() => window.location.reload()} />}
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === "records" && (
        <section className="space-y-2">
          <div className="glass rounded-xl px-3.5 py-2.5 text-[12px] text-muted-foreground">
            按时间倒序显示最近 100 条诊断、学习、测试、复习和状态变更记录。
          </div>
          {recordsError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] text-rose-700">
              {recordsError}
            </div>
          )}
          {recordsLoading ? (
            <div className="glass rounded-2xl p-8 text-center text-[12.5px] text-muted-foreground">
              正在读取学习记录…
            </div>
          ) : !recordsError && records.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center text-[12.5px] text-muted-foreground">
              还没有学习记录。完成诊断、状态调整或专项测试后，记录会显示在这里。
            </div>
          ) : (
            <div className="space-y-2">
              {records.map((record) => (
                <article key={record.id} className="glass flex flex-wrap items-start gap-3 rounded-xl px-3.5 py-2.5">
                  <span className="kp-chip shrink-0">
                    {RECORD_LABELS[record.type] || record.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{record.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                      <Link href={`/?kp=${encodeURIComponent(record.kp_id)}`} className="hover:text-primary hover:underline">
                        {record.knowledge_point}
                      </Link>
                      {record.detail && <span> · {record.detail}</span>}
                    </div>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(record.created_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "notes" && (
        <NotesPanel
          knowledgePoints={allRows.map(({ chapter, sectionName, leaf }) => ({
            id: leaf.id,
            label: `${chapter.name.replace(/^[一二三四五六七八九十]+、/, "")} · ${sectionName} · ${leaf.name}`,
          }))}
        />
      )}
    </div>
  );
}
