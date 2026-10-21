"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Database,
  NotebookPen,
  Target,
  CalendarClock,
  BookmarkX,
} from "lucide-react";
import { KnowledgeTree, type TreeChapterData } from "@/components/knowledge/KnowledgeTree";
import {
  KP_STATUS,
  KP_STATUS_ORDER,
  type KpStatus,
  type StatusCounts,
} from "@/lib/kpStatus";

interface Leaf {
  id: string;
  name: string;
  status: KpStatus;
  questionCount: number;
  difficulty: string;
  locked: boolean;
  lastStudiedAt: string | null;
}

interface SectionOut {
  id: string;
  name: string;
  order: number;
  progress: number;
  counts: StatusCounts;
  leaves: Leaf[];
}

interface ChapterOut {
  id: string;
  name: string;
  order: number;
  weight: number;
  weightParts: { core: number; centrality: number; gap: number };
  weightLocked: boolean;
  weightManual: number | null;
  progress: number;
  counts: StatusCounts;
  leafCount: number;
  questionCount: number;
  coverage: { covered: number; total: number };
  supplement: number;
  sections: SectionOut[];
}

interface KpDetail {
  ok: boolean;
  schemaReady: boolean;
  kp: { id: string; content: string; difficulty: string; section: string; chapter: string };
  detail: {
    display_name: string | null;
    summary: string | null;
    formulas: unknown;
    conditions: string[];
    error_patterns: string[];
  } | null;
  state: { status: KpStatus; locked: boolean; lastStudiedAt: string | null };
  questions: { id: string; question_type: string; difficulty: string; content: string }[];
  evidence: {
    id: string;
    question_id: string | null;
    answer_record_id: string | null;
    quote: string | null;
    error_type: string | null;
    reason: string | null;
    strength: string | null;
    source: string | null;
    created_at: string;
  }[];
  records: { id: string; type: string; title: string; detail: string | null; created_at: string }[];
  diagnoses: { id: string; error_rate: number; sample_size: number; conclusion: string; confidence: string; suggested_status: KpStatus; created_at: string }[];
  prerequisites: { id: string; name: string; type: string }[];
}

interface Overview {
  ok: boolean;
  schemaReady: boolean;
  totals: {
    chapters: number;
    sections: number;
    kps: number;
    questions: number;
    covered: number;
    counts: StatusCounts;
    progress: number;
  };
  chapters: ChapterOut[];
  suggestions: { chapterId: string; name: string; reason: string }[];
  error?: string;
}

interface ProgressSnapshot { snapshot_date: string; progress: number; total: number }

function Ring({ value, size = 84 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f6bff" />
          <stop offset="60%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,145,200,.18)" strokeWidth="7" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="num"
        fontSize="19"
        fontWeight="700"
        fill="#0f172a"
      >
        {value.toFixed(1)}
      </text>
    </svg>
  );
}

function StatRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-14 shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(120,145,200,.14)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="num w-8 shrink-0 text-right text-[12.5px] font-medium">{value}</span>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: "chapter" | "kp"; id: string } | null>(null);
  const [activeStatuses, setActiveStatuses] = useState<KpStatus[]>([...KP_STATUS_ORDER]);
  const [reloadKey, setReloadKey] = useState(0);
  const [snapshots, setSnapshots] = useState<ProgressSnapshot[]>([]);

  useEffect(() => {
    fetch("/api/kp/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Overview) => {
        if (!d.ok) throw new Error(d.error || "加载失败");
        setData(d);
        void fetch("/api/kp/snapshots", { method: "POST" })
          .then((r) => r.json())
          .then(() => fetch("/api/kp/snapshots", { cache: "no-store" }))
          .then((r) => r.json())
          .then((s) => { if (s.ok) setSnapshots(s.snapshots || []); })
          .catch(() => undefined);
        // 刷新时保留当前选中的章节/知识点，避免面板跳回第一章
        setSelected((cur) => {
          if (cur) return cur;
          // 深链：/ ?kp=<id> 直接定位到某个知识点（其它页面的「查看诊断」入口会用到）
          const wanted = new URLSearchParams(window.location.search).get("kp");
          if (wanted) {
            for (const c of d.chapters) {
              for (const s of c.sections) {
                if (s.leaves.some((l) => l.id === wanted)) return { type: "kp", id: wanted };
              }
            }
          }
          const gapChapter = d.chapters.find((c) => c.counts.not_mastered > 0) || d.chapters[0];
          return gapChapter ? { type: "chapter", id: gapChapter.id } : null;
        });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const moveKpFromTree = useCallback(async (kpId: string, sectionId: string) => {
    try {
      const response = await fetch("/api/kp/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId, sectionId }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "调整知识点归属失败");
      reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "调整知识点归属失败");
    }
  }, [reload]);

  const toggleStatus = useCallback((s: KpStatus) => {
    setActiveStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }, []);

  const onFocus = useCallback((id: string | null) => {
    setFocusId((current) => id !== null && current === id ? null : id);
    if (id) setSelected({ type: "chapter", id });
  }, []);

  const onSelect = useCallback((kpId: string) => {
    setSelected({ type: "kp", id: kpId });
  }, []);

  const chapterOfKp = useMemo(() => {
    if (!data) return null;
    for (const c of data.chapters) {
      for (const s of c.sections) {
        const kp = s.leaves.find((l) => l.id === selected?.id);
        if (kp) return { chapter: c, section: s, kp };
      }
    }
    return null;
  }, [data, selected]);

  const selectedChapter = useMemo(() => {
    if (!data || !selected) return null;
    if (selected.type === "chapter") return data.chapters.find((c) => c.id === selected.id) || null;
    return chapterOfKp?.chapter || null;
  }, [data, selected, chapterOfKp]);

  const treeChapters: TreeChapterData[] = useMemo(
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

  if (err) {
    return (
      <div className="glass rounded-2xl p-8">
        <h2 className="text-lg font-semibold">数据加载失败</h2>
        <p className="mt-2 text-sm text-muted-foreground">{err}</p>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          请检查 Supabase 环境变量是否配置正确，以及数据库是否可访问。
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass flex h-[60vh] items-center justify-center rounded-2xl">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
          <span className="text-[12.5px] text-muted-foreground">正在构建知识树…</span>
        </div>
      </div>
    );
  }

  const t = data.totals;
  const counts = t.counts;
  const studied = counts.mastered + counts.pending + counts.learning + counts.not_mastered;

  const quick = [
    { href: "/learning?tab=gaps", label: "智能诊断", icon: Brain, hint: `${counts.not_mastered + counts.pending} 个待处理` },
    { href: "/learning?tab=tests", label: "专项测试", icon: Target, hint: "按知识点出卷" },
    { href: "/wrong-answers", label: "错题本", icon: BookmarkX, hint: "间隔复习" },
    { href: "/learning?tab=notes", label: "笔记本", icon: NotebookPen, hint: "知识库" },
    { href: "/plan", label: "学习计划", icon: CalendarClock, hint: "每日任务" },
    { href: "/data", label: "数据管理", icon: Database, hint: "备份与同步" },
  ];

  return (
    <div className="space-y-4">
      {/* 顶部 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="inline-block h-1 w-6 rounded-full bg-gradient-to-r from-primary to-[#22d3ee]" />
            高等数学 · 知识漏洞管理
          </div>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight">
            学习总览
            <span className="ml-2 text-[13px] font-normal text-muted-foreground">
              {t.chapters} 章 · {t.sections} 节 · {t.kps} 个知识点
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/knowledge-graph"
            className="rounded-xl border border-border bg-white/70 px-3.5 py-2 text-[12.5px] font-medium text-foreground/80 transition hover:bg-white"
          >
            全屏知识图谱
          </Link>
          <Link
            href="/knowledge"
            className="rounded-xl bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground shadow-[0_10px_24px_-12px_rgba(79,107,255,.9)] transition hover:brightness-105"
          >
            管理知识点
          </Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* 左：总览 */}
        <div className="space-y-3">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3.5">
              <Ring value={t.progress} />
              <div className="min-w-0">
                <div className="text-[12px] text-muted-foreground">整体学习进度</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground/80">
                  （已掌握 + 待确认）÷ 总数
                </div>
                <div className="mt-1.5 text-[11.5px] text-muted-foreground">
                  已开始 <span className="num font-semibold text-foreground">{studied}</span> / {t.kps}
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <StatRow label="已掌握" value={counts.mastered} total={t.kps} color={KP_STATUS.mastered.color} />
              <StatRow label="待确认" value={counts.pending} total={t.kps} color={KP_STATUS.pending.color} />
              <StatRow label="未掌握" value={counts.not_mastered} total={t.kps} color={KP_STATUS.not_mastered.color} />
              <StatRow label="学习中" value={counts.learning} total={t.kps} color={KP_STATUS.learning.color} />
              <StatRow label="未学习" value={counts.new} total={t.kps} color={KP_STATUS.new.color} />
            </div>
            <div className="mt-3 border-t border-border/70 pt-2.5">
              <div className="mb-1 flex items-center justify-between text-[10.5px] text-muted-foreground"><span>真实进度变化</span><span>{snapshots.length ? `${snapshots.length} 天` : "等待迁移启用"}</span></div>
              {snapshots.length >= 2 ? <ProgressTrend snapshots={snapshots} /> : <div className="py-2 text-[10.5px] leading-relaxed text-muted-foreground">{snapshots.length === 1 ? `已记录 ${snapshots[0].snapshot_date} 的首次快照；后续每日访问会追加真实进度。` : "尚无历史快照。应用 0009 迁移后，首次访问会记录真实起点。"}</div>}
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">当前学习路径</h3>
              <Link href="/plan" className="text-[11px] text-primary hover:underline">
                计划
              </Link>
            </div>
            <div className="mt-2.5 space-y-2">
              {data.suggestions.length === 0 && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  还没有诊断证据。建议先对权重最高的章节做一轮专项测试。
                </p>
              )}
              {data.suggestions.map((s, i) => (
                <button
                  key={s.chapterId}
                  onClick={() => {
                    setFocusId(s.chapterId);
                    setSelected({ type: "chapter", id: s.chapterId });
                  }}
                  className="flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2 py-1.5 text-left transition hover:border-border hover:bg-white/60"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10.5px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium">
                      {s.name.replace(/^[一二三四五六七八九十]+、/, "")}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{s.reason}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <h3 className="text-[13px] font-semibold">题库覆盖</h3>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="num text-[22px] font-bold">{t.covered}</span>
              <span className="text-[12px] text-muted-foreground">/ {t.kps} 个知识点有题</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(120,145,200,.14)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-[#22d3ee]"
                style={{ width: `${t.kps ? (t.covered / t.kps) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              共 {t.questions} 道题。未覆盖的知识点无法通过答题积累证据。
            </p>
          </div>
        </div>

        {/* 中：知识树 */}
        <div className="min-h-[520px] xl:min-h-0">
          <div className="glass h-full overflow-hidden rounded-2xl p-1.5">
            <div className="h-[520px] xl:h-[calc(100vh-190px)] xl:min-h-[560px]">
              <KnowledgeTree
                chapters={treeChapters}
                focusId={focusId}
                onFocus={onFocus}
                selectedId={selected?.type === "kp" ? selected.id : null}
                onSelect={onSelect}
                onMoveKp={moveKpFromTree}
                activeStatuses={activeStatuses}
                onToggleStatus={toggleStatus}
                onResetStatuses={() => setActiveStatuses([...KP_STATUS_ORDER])}
              />
            </div>
          </div>
        </div>

        {/* 右：详情 */}
        <div className="space-y-3">
          <div className="glass-strong rounded-2xl p-4">
            {selected?.type === "kp" && chapterOfKp ? (
              <KpPanel
                kp={chapterOfKp.kp}
                section={chapterOfKp.section}
                chapter={chapterOfKp.chapter}
                sections={data.chapters.flatMap((c) => c.sections.map((s) => ({ id: s.id, name: s.name, chapterName: c.name })))}
                onChanged={reload}
                onFocusChapter={() => {
                  setFocusId(chapterOfKp.chapter.id);
                  setSelected({ type: "chapter", id: chapterOfKp.chapter.id });
                }}
              />
            ) : selectedChapter ? (
              <ChapterPanel
                chapter={selectedChapter}
                onFocus={() => setFocusId((current) => current === selectedChapter.id ? null : selectedChapter.id)}
                focused={focusId === selectedChapter.id}
                onChanged={reload}
              />
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                点击树上的章节或知识点查看详情。
              </p>
            )}
          </div>

          <div className="glass rounded-2xl p-4">
            <h3 className="text-[13px] font-semibold">今日学习建议</h3>
            <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary" />
                先处理「未掌握」的 {counts.not_mastered} 个知识点，它们会阻塞后续依赖。
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#f0b445]" />
                「待确认」的 {counts.pending} 个需要一次专项测试给出结论。
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#22d3ee]" />
                {t.covered < t.kps
                  ? `还有 ${t.kps - t.covered} 个知识点没有题目，补齐后才能建立诊断证据。`
                  : "题库已覆盖全部知识点。"}
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 底部快捷操作 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {quick.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="glass group flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-20px_rgba(30,48,110,.45)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
              <q.icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium">{q.label}</span>
              <span className="block truncate text-[10.5px] text-muted-foreground">{q.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProgressTrend({ snapshots }: { snapshots: ProgressSnapshot[] }) {
  const width = 228;
  const height = 54;
  const pad = 5;
  const values = snapshots.slice(-30);
  const points = values.map((item, index) => {
    const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (Math.max(0, Math.min(100, Number(item.progress))) / 100) * (height - pad * 2);
    return { x, y, item };
  });
  return <div className="flex items-center gap-2"><svg viewBox={`0 0 ${width} ${height}`} className="h-14 min-w-0 flex-1" role="img" aria-label="每日真实学习进度变化"><polyline fill="none" stroke="#4f6bff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points.map((p) => `${p.x},${p.y}`).join(" ")} />{points.map((point) => <circle key={point.item.snapshot_date} cx={point.x} cy={point.y} r="2.5" fill="#22d3ee"><title>{point.item.snapshot_date}：{point.item.progress}%（{point.item.total} 个知识点）</title></circle>)}</svg><div className="num shrink-0 text-[11px] font-semibold text-primary">{Number(values[values.length - 1].progress).toFixed(1)}%</div></div>;
}

function ChapterPanel({
  chapter,
  onFocus,
  focused,
  onChanged,
}: {
  chapter: ChapterOut;
  onFocus: () => void;
  focused: boolean;
  onChanged: () => void;
}) {
  const c = chapter.counts;
  const [weightDraft, setWeightDraft] = useState(chapter.weightManual ?? Math.max(0.05, Math.min(1, chapter.weight)));
  const [weightBusy, setWeightBusy] = useState(false);
  const [weightMessage, setWeightMessage] = useState("");
  useEffect(() => setWeightDraft(chapter.weightManual ?? Math.max(0.05, Math.min(1, chapter.weight))), [chapter.id, chapter.weightManual, chapter.weight]);
  const saveWeight = async (locked: boolean) => {
    setWeightBusy(true); setWeightMessage("");
    try {
      const response = await fetch("/api/kp/weight", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId: chapter.id, weight: weightDraft, locked }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "权重保存失败");
      setWeightMessage(locked ? "人工权重已锁定。" : "已恢复默认计算权重。");
      onChanged();
    } catch (e) { setWeightMessage(e instanceof Error ? e.message : "权重保存失败"); }
    finally { setWeightBusy(false); }
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            章节
          </div>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug">{chapter.name}</h3>
        </div>
        <button
          onClick={onFocus}
          className="shrink-0 rounded-lg border border-border bg-white/70 px-2.5 py-1 text-[11px] text-foreground/70 hover:bg-white"
        >
          {focused ? "收起章节" : "展开章节"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="知识点" value={chapter.leafCount} />
        <MiniStat label="进度" value={`${chapter.progress.toFixed(0)}%`} />
        <MiniStat label="题目" value={chapter.questionCount} />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-muted-foreground">漏洞分布</span>
          <span className="num text-muted-foreground">
            权重 {(chapter.weight * 100).toFixed(0)}%
          </span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-[rgba(120,145,200,.14)]">
          {KP_STATUS_ORDER.map((s) => {
            const v = c[s];
            if (!v) return null;
            return (
              <div
                key={s}
                style={{ width: `${(v / chapter.leafCount) * 100}%`, background: KP_STATUS[s].color }}
                title={`${KP_STATUS[s].label} ${v}`}
              />
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {KP_STATUS_ORDER.filter((s) => c[s] > 0).map((s) => (
            <div key={s} className="flex items-center gap-1.5 text-[11.5px]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: KP_STATUS[s].color }}
              />
              <span className="text-muted-foreground">{KP_STATUS[s].short}</span>
              <span className="num ml-auto font-medium">{c[s]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-secondary/60 p-2.5">
        <div className="text-[11px] font-medium text-muted-foreground">优先处理</div>
        <p className="mt-1 text-[12px] leading-relaxed">
          {c.not_mastered > 0
            ? `先补「未掌握」的 ${c.not_mastered} 个，它们多为后续章节的前置。`
            : c.pending > 0
            ? `${c.pending} 个知识点证据不足，安排一次专项测试。`
            : chapter.coverage.covered === 0
            ? "本章尚无题目，建议先生成一批基础题再诊断。"
            : "本章状态良好，可安排复测巩固。"}
        </p>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>题库覆盖</span>
        <span className="num">
          {chapter.coverage.covered} / {chapter.coverage.total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[rgba(120,145,200,.14)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-[#22d3ee]"
          style={{
            width: `${chapter.coverage.total ? (chapter.coverage.covered / chapter.coverage.total) * 100 : 0}%`,
          }}
        />
      </div>
      <details className="mt-2 rounded-lg border border-border/70 bg-white/45 px-2.5 py-2">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">章节重要性权重 {chapter.weightLocked ? "· 人工锁定" : "· 自动估算"}</summary>
        <div className="mt-2 flex items-center gap-2"><input aria-label="章节相对权重" type="range" min="5" max="100" step="5" value={Math.round(weightDraft * 100)} onChange={(event) => setWeightDraft(Number(event.target.value) / 100)} className="min-w-0 flex-1" /><span className="num w-9 text-right text-[11px]">{Math.round(weightDraft * 100)}</span></div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">相对权重用于章节排序和全局加权；覆盖缺口仍单独计算，不会因题量多而降低章节重要性。</p>
        <div className="mt-2 flex gap-1.5"><button disabled={weightBusy} onClick={() => void saveWeight(true)} className="rounded-lg bg-primary px-2.5 py-1 text-[10.5px] font-medium text-primary-foreground disabled:opacity-50">{weightBusy ? "保存…" : "锁定此权重"}</button>{chapter.weightLocked && <button disabled={weightBusy} onClick={() => void saveWeight(false)} className="rounded-lg border border-border bg-white px-2.5 py-1 text-[10.5px] disabled:opacity-50">恢复自动</button>}</div>
        {weightMessage && <p className="mt-1.5 text-[10.5px] text-muted-foreground">{weightMessage}</p>}
      </details>

      <div className="mt-3 flex gap-2">
        <Link
          href={`/learning?tab=gaps&chapter=${chapter.id}`}
          className="flex-1 rounded-lg bg-primary py-1.5 text-center text-[12px] font-medium text-primary-foreground"
        >
          查看漏洞
        </Link>
        <Link
          href={`/create-paper?chapter=${chapter.id}`}
          className="flex-1 rounded-lg border border-border bg-white/70 py-1.5 text-center text-[12px] font-medium text-foreground/80"
        >
          专项组卷
        </Link>
      </div>
    </div>
  );
}

function KpPanel({
  kp,
  section,
  chapter,
  sections,
  onFocusChapter,
  onChanged,
}: {
  kp: Leaf;
  section: SectionOut;
  chapter: ChapterOut;
  sections: { id: string; name: string; chapterName: string }[];
  onFocusChapter: () => void;
  onChanged: () => void;
}) {
  const meta = KP_STATUS[kp.status];
  const unmastered = kp.status === "not_mastered" || kp.status === "pending" || kp.status === "new";

  const [detail, setDetail] = useState<KpDetail | null>(null);
  const [saving, setSaving] = useState<KpStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [targetSectionId, setTargetSectionId] = useState(section.id);
  const [moving, setMoving] = useState(false);
  const [moveNotice, setMoveNotice] = useState("");
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    setTargetSectionId(section.id);
  }, [kp.id, section.id]);

  useEffect(() => {
    setMoveNotice("");
  }, [kp.id]);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setNotice("");
    fetch(`/api/kp/detail?kpId=${kp.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && d.ok && setDetail(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kp.id]);

  const changeStatus = async (next: KpStatus) => {
    if (next === kp.status || saving) return;
    setSaving(next);
    setNotice("");
    try {
      const res = await fetch("/api/kp/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpId: kp.id, status: next }),
      });
      const json = await res.json();
      if (!json.ok) {
        setNotice(json.error || "保存失败");
      } else {
        if (json.warning) setNotice(json.warning);
        onChanged();
      }
    } catch {
      setNotice("网络错误，状态未保存");
    } finally {
      setSaving(null);
    }
  };

  const moveKnowledgePoint = async () => {
    if (targetSectionId === section.id || moving) return;
    setMoving(true);
    setMoveNotice("");
    try {
      const response = await fetch("/api/kp/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpId: kp.id, sectionId: targetSectionId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "调整归属失败");
      setMoveNotice(result.warning || "归属已调整，题目与学习历史关联保持不变。");
      onChanged();
    } catch (e) {
      setMoveNotice(e instanceof Error ? e.message : "调整归属失败");
    } finally {
      setMoving(false);
    }
  };

  const runDiagnosis = async () => {
    if (diagnosing) return;
    const consent = window.confirm(`AI 诊断会发送最多 30 条与「${kp.name}」相关的题目、作答和评分记录至服务端配置的 DeepSeek。不会发送密码或密钥。是否继续？`);
    if (!consent) return;
    setDiagnosing(true); setDiagnosis(null); setNotice("");
    try {
      const response = await fetch("/api/kp/diagnose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, consent: true }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "诊断失败");
      setDiagnosis(result);
      if (result.stats?.errorRate >= 20) {
        const understood = window.confirm(`本知识点错误率为 ${result.stats.errorRate}%。你是否理解这个知识点？选择「确定」=理解，选择「取消」=仍有疑问。根据诊断规则，两种回答都会安排专项测试。`);
        const testResponse = await fetch("/api/kp/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: kp.id, count: 5, kind: kp.status === "mastered" ? "retest" : "initial" }) });
        const testResult = await testResponse.json();
        if (testResponse.ok && testResult.ok) {
          setNotice(`你选择了${understood ? "理解" : "仍有疑问"}；已按规则创建专项测试。正在进入答题页。`);
          window.location.assign(testResult.href);
        } else {
        setNotice(`诊断已保存。${testResult.error || "当前无法创建专项测试"}${kp.questionCount < 5 ? "；可在学习中心的专项测试页生成候选补充题" : ""}`);
        }
      }
      onChanged();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "诊断失败");
    } finally { setDiagnosing(false); }
  };

  const evidenceCount = detail?.evidence.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          知识点
        </span>
        <span
          className="kp-chip"
          style={{ background: meta.soft, borderColor: meta.border, color: meta.ink }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          {meta.label}
          {kp.locked && <span className="ml-1 opacity-60">· 手动</span>}
        </span>
      </div>

      <h3 className="mt-1.5 text-[14.5px] font-semibold leading-snug">{kp.name}</h3>

      <button
        onClick={onFocusChapter}
        className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary"
      >
        {chapter.name.replace(/^[一二三四五六七八九十]+、/, "")} · {section.name}
        <ArrowRight size={11} />
      </button>

      <details className="mt-2 rounded-xl border border-border/70 bg-white/50 px-2.5 py-2">
        <summary className="cursor-pointer text-[11.5px] font-medium text-foreground/75">调整归属</summary>
        <div className="mt-2 flex gap-1.5">
          <select value={targetSectionId} onChange={(event) => setTargetSectionId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-[11px]">
            {sections.map((option) => (
              <option key={option.id} value={option.id}>
                {option.chapterName.replace(/^[一二三四五六七八九十]+、/, "")} · {option.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={moving || targetSectionId === section.id} onClick={() => void moveKnowledgePoint()} className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-45">
            {moving ? "保存…" : "保存"}
          </button>
        </div>
        {moveNotice && <p role="status" className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">{moveNotice}</p>}
      </details>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="相关题目" value={kp.questionCount} />
        <MiniStat label="证据" value={evidenceCount} />
        <MiniStat label="前置" value={detail?.prerequisites.length ?? 0} />
      </div>

      {/* 证据摘要：能追溯到具体题目/答题记录 */}
      {evidenceCount > 0 ? (
        <div className="mt-3 space-y-1.5">
          <div className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            诊断证据
          </div>
          {detail!.evidence.slice(0, 3).map((e) => (
            <div key={e.id} className="rounded-lg bg-secondary/60 px-2.5 py-1.5 text-[11.5px]">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="rounded bg-white/70 px-1 py-0.5 text-[10px]">
                  {e.error_type || "错误"}
                </span>
                <span className="opacity-70">{e.strength || "weak"}</span>
              </div>
              {e.quote && <div className="mt-1 line-clamp-2 text-foreground/80">{e.quote}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-secondary/60 p-2.5 text-[12px] leading-relaxed text-muted-foreground">
          {kp.questionCount === 0
            ? "该知识点还没有题目，无法积累答题证据。建议先生成题目。"
            : "尚无诊断记录。做一次专项测试即可生成证据与结论。"}
        </div>
      )}
      {detail?.diagnoses?.[0] && !diagnosis && <div className="mt-2 rounded-lg bg-secondary/60 p-2.5 text-[11.5px] leading-relaxed"><div className="font-medium">最近诊断 · 错误率 {detail.diagnoses[0].error_rate}% · {detail.diagnoses[0].confidence} 可信度</div><div className="mt-1 text-muted-foreground">{detail.diagnoses[0].conclusion}</div></div>}

      <div className="mt-3 space-y-2">
        <button type="button" disabled={diagnosing} onClick={() => void runDiagnosis()} className="w-full rounded-xl bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50">
          {diagnosing ? "正在整理证据并诊断…" : "运行 AI 知识诊断"}
        </button>
        {diagnosis && <div className="rounded-xl border border-primary/15 bg-white/70 p-2.5 text-[11.5px] leading-relaxed">
          {diagnosis.insufficient ? <p className="text-muted-foreground">{diagnosis.message}</p> : <>
            <div className="font-medium">{diagnosis.diagnosis?.conclusion}</div>
            <div className="mt-1 text-muted-foreground">样本 {diagnosis.stats?.total} 条 · 错误率 {diagnosis.stats?.errorRate}% · 可信度 {diagnosis.diagnosis?.confidence}{diagnosis.diagnosis?.lockedByUser ? " · 状态由你手动锁定" : ""}</div>
            {diagnosis.diagnosis?.gap && <p className="mt-1">知识缺口：{diagnosis.diagnosis.gap}</p>}
            {diagnosis.diagnosis?.advice && <p className="mt-1">建议：{diagnosis.diagnosis.advice}</p>}
            {diagnosis.diagnosis?.aiError && <p className="mt-1 text-amber-700">{diagnosis.diagnosis.aiError}</p>}
            <div className="mt-1 text-[10.5px] text-muted-foreground">诊断依据：{diagnosis.evidence?.map((e: any) => `${e.questionText}（作答：${e.userAnswer || "未作答"}）`).join("；")}</div>
          </>}
        </div>}
      </div>

      {/* 手动改状态：需求要求用户可改为任意状态，且 AI 不得覆盖 */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
            掌握状态
          </span>
          <span className="text-[10px] text-muted-foreground">手动修改后不再被自动覆盖</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {KP_STATUS_ORDER.map((s) => {
            const m = KP_STATUS[s];
            const active = kp.status === s;
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={Boolean(saving)}
                className="rounded-lg border px-2 py-1 text-[11px] transition disabled:opacity-50"
                style={{
                  background: active ? m.soft : "rgba(255,255,255,.6)",
                  borderColor: active ? m.border : "rgba(0,0,0,.08)",
                  color: active ? m.ink : "#6b7690",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {saving === s ? "…" : m.label}
              </button>
            );
          })}
        </div>
        {notice && (
          <div className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
            {notice}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {unmastered ? (
          <>
            <ActionRow label="查看漏洞列表" hint="诊断证据与知识点状态" href={`/learning?tab=gaps&kp=${kp.id}`} />
            <ActionRow label="开始学习" hint="分步讲解 + 分级提示" href={`/learning?tab=gaps&kp=${kp.id}&mode=teach`} />
            <ActionRow label="专项测试" hint={`${kp.questionCount} 道相关题目`} href={`/learning?tab=tests&kp=${kp.id}`} />
          </>
        ) : (
          <>
            <ActionRow label="查看知识内容" hint="摘要 · 公式 · 条件" href={`/knowledge?kp=${kp.id}`} />
            <ActionRow label="复习学习" hint="重新走一遍讲解" href={`/learning?tab=gaps&kp=${kp.id}&mode=teach`} />
            <ActionRow label="专项测试" hint="独立验证是否仍掌握" href={`/learning?tab=tests&kp=${kp.id}`} />
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-secondary/70 px-2.5 py-1.5">
      <div className="num text-[15px] font-semibold leading-tight">{value}</div>
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ActionRow({ label, hint, href }: { label: string; hint: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-xl border border-border bg-white/70 px-2.5 py-2 transition hover:border-primary/40 hover:bg-white"
    >
      <span className="text-[12.5px] font-medium">{label}</span>
      <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
        {hint}
        <ArrowRight size={10} />
      </span>
    </Link>
  );
}
