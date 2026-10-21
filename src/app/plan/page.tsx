"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, ArrowDownToLine, Info, RefreshCw, Check, Plus, ArrowUp } from "lucide-react";
import { KP_STATUS, type KpStatus } from "@/lib/kpStatus";

interface Task {
  id: string;
  kp_id: string;
  type: "learn" | "test" | "retest" | "review";
  priority: number;
  source: "auto" | "manual";
  status: string;
  due_at: string | null;
  kpName: string;
  kpStatus: KpStatus;
  chapter: string;
  section: string;
}

interface PlanData {
  ok: boolean;
  ready: boolean;
  date: string;
  settings: { daily_limit: number; retest_days: number; review_days: number };
  tasks: Task[];
  pushedOut: { id: string; kpName: string; type: string; taskDate?: string }[];
  error?: string;
}

interface KpOption { id: string; name: string; chapter: string; section: string }

const TYPE_LABEL: Record<Task["type"], string> = {
  learn: "学习",
  test: "专项测试",
  retest: "复测",
  review: "复习",
};

const TYPE_COLOR: Record<Task["type"], string> = {
  learn: "#4a9eff",
  test: "#7c5cff",
  retest: "#a78bfa",
  review: "#2fe0c0",
};

export default function PlanPage() {
  const [data, setData] = useState<PlanData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<KpOption[]>([]);
  const [selectedKp, setSelectedKp] = useState("");
  const [manualType, setManualType] = useState<Task["type"]>("test");
  const [manualDate, setManualDate] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    // 页面首次打开时幂等生成计划；已存在的手动任务和优先级不会被覆盖。
    fetch("/api/plan/today", { method: "POST" })
      .then((r) => r.json())
      .then((d: PlanData) => {
        if (!d.ok) throw new Error(d.error || "加载失败");
        setData(d);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "加载失败"));
    fetch("/api/kp/overview", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.ok) setOptions(d.chapters.flatMap((chapter: any) => chapter.sections.flatMap((section: any) => section.leaves.map((leaf: any) => ({ id: leaf.id, name: leaf.name, chapter: chapter.name, section: section.name })))));
    }).catch(() => undefined);
  }, []);

  async function updateTask(id: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/plan/today", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "任务更新失败");
    setNotice(result.warning || "任务已更新。");
    const fresh = await fetch("/api/plan/today", { cache: "no-store" }).then((r) => r.json());
    if (fresh.ok) setData(fresh);
  }

  async function refreshPlan() {
    setBusy(true); setNotice(""); setErr("");
    try {
      const response = await fetch("/api/plan/today", { method: "POST" });
      const next = await response.json();
      if (!response.ok || !next.ok) throw new Error(next.error || "计划生成失败");
      setData(next); setNotice(`计划已生成，新增 ${next.created || 0} 项。`);
    } catch (e) { setErr(e instanceof Error ? e.message : "计划生成失败"); }
    finally { setBusy(false); }
  }

  async function addManualTask(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedKp) return;
    setBusy(true); setNotice(""); setErr("");
    try {
      const response = await fetch("/api/plan/today", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId: selectedKp, type: manualType, taskDate: manualDate || data?.date }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "添加任务失败");
      setNotice("已加入手动任务。");
      const fresh = await fetch("/api/plan/today", { cache: "no-store" }).then((r) => r.json());
      if (fresh.ok) setData(fresh);
    } catch (e) { setErr(e instanceof Error ? e.message : "添加任务失败"); }
    finally { setBusy(false); }
  }

  if (err) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{err}</div>;
  }
  if (!data) {
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
          <h1 className="text-[22px] font-bold leading-tight">学习计划</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {data.date} · 每日上限 {data.settings.daily_limit} 项 · 复测间隔{" "}
            {data.settings.retest_days} 天
          </p>
        </div>
        <Link
          href="/learning?tab=gaps"
          className="rounded-xl bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground"
        >
          去处理漏洞
        </Link>
        <button onClick={() => void refreshPlan()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white/70 px-3.5 py-2 text-[12.5px] font-medium disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} />刷新自动计划</button>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock size={15} />
          </span>
          <h2 className="text-[13.5px] font-semibold">今日任务</h2>
          <span className="num ml-auto text-[11.5px] text-muted-foreground">
            {data.tasks.length} 项
          </span>
        </div>

        {data.tasks.length === 0 ? (
          <div className="mt-3 rounded-xl bg-secondary/60 px-4 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">今天还没有任务。</p>
            <p className="mx-auto mt-1.5 max-w-lg text-[12px] leading-relaxed text-muted-foreground/80">
              任务包括未学习/学习中的知识点、待确认复测和已掌握复习。刷新计划会根据状态和每日上限自动排期。
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-1.5">
            {data.tasks.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border/70 bg-white/60 px-3 py-2"
              >
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    background: `${TYPE_COLOR[t.type]}1a`,
                    color: TYPE_COLOR[t.type],
                  }}
                >
                  {TYPE_LABEL[t.type]}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">{t.kpName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {t.chapter.replace(/^[一二三四五六七八九十]+、/, "")} · {t.section}
                  </div>
                </div>
                <span
                  className="kp-chip shrink-0"
                  style={{
                    background: KP_STATUS[t.kpStatus].soft,
                    borderColor: KP_STATUS[t.kpStatus].border,
                    color: KP_STATUS[t.kpStatus].ink,
                  }}
                >
                  {KP_STATUS[t.kpStatus].short}
                </span>
                <span className="num shrink-0 text-[11px] text-muted-foreground">
                  优先级 {t.priority}
                </span>
                <div className="flex items-center gap-1">
                  <button title="优先级 +10" onClick={() => void updateTask(t.id, { priority: Math.min(160, t.priority + 10) }).catch((e) => setErr(e.message))} className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] hover:bg-secondary"><ArrowUp size={12} /></button>
                  <button title="标记完成" onClick={() => void updateTask(t.id, { status: "done" }).catch((e) => setErr(e.message))} className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] hover:bg-secondary"><Check size={12} /></button>
                  {t.type === "learn" && <button title="暂不加入自动学习任务" onClick={() => void updateTask(t.id, { status: "skipped" }).catch((e) => setErr(e.message))} className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] hover:bg-secondary">暂不学习</button>}
                  <button title="顺延一天" onClick={() => { const tomorrow = new Date(`${data.date}T12:00:00+08:00`); tomorrow.setDate(tomorrow.getDate() + 1); const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(tomorrow); void updateTask(t.id, { taskDate: date }).catch((e) => setErr(e.message)); }} className="rounded-lg border border-border bg-white px-2 py-1 text-[10px] hover:bg-secondary">明日</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.pushedOut.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f0b445]/10 px-3 py-2 text-[11.5px] leading-relaxed text-[#8a5f00]">
            <ArrowDownToLine size={13} className="mt-0.5 shrink-0" />
            <span>
              今日上限外及已排期的后续任务：{data.pushedOut.length} 项。
              {data.pushedOut.slice(0, 5).map((task) => ` ${task.taskDate || "后续"} ${task.kpName}`).join("；")}
            </span>
          </div>
        )}

        {!data.ready && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#f0b445]/10 px-3 py-2 text-[11.5px] leading-relaxed text-[#8a5f00]">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              计划表尚未创建。执行{" "}
              <code className="rounded bg-white/60 px-1">20261021123746_kp_loop.sql</code> 后，
              任务会自动写入 <code className="rounded bg-white/60 px-1">kp_tasks</code>。
            </span>
          </div>
        )}
      </div>

      <form onSubmit={(event) => void addManualTask(event)} className="glass flex flex-wrap items-end gap-2.5 rounded-2xl p-4">
        <div className="min-w-[220px] flex-1"><label className="mb-1 block text-[11px] text-muted-foreground">手动安排知识点</label><select required value={selectedKp} onChange={(event) => setSelectedKp(event.target.value)} className="w-full rounded-lg border border-border bg-white px-2.5 py-2 text-[12px]"><option value="">选择知识点</option>{options.map((kp) => <option key={kp.id} value={kp.id}>{kp.chapter} / {kp.section} / {kp.name}</option>)}</select></div>
        <div><label className="mb-1 block text-[11px] text-muted-foreground">任务</label><select value={manualType} onChange={(event) => setManualType(event.target.value as Task["type"])} className="rounded-lg border border-border bg-white px-2.5 py-2 text-[12px]">{Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div><label className="mb-1 block text-[11px] text-muted-foreground">日期</label><input type="date" min={data.date} value={manualDate || data.date} onChange={(event) => setManualDate(event.target.value)} className="rounded-lg border border-border bg-white px-2.5 py-2 text-[12px]" /></div>
        <button disabled={busy || !selectedKp} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50"><Plus size={13} />添加手动任务</button>
      </form>
      {notice && <p className="text-[11.5px] text-[#087763]">{notice}</p>}

      <div className="glass rounded-2xl p-4">
        <h2 className="text-[13.5px] font-semibold">排期规则</h2>
        <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
          <li>· 到期测试优先加入当天任务；超出上限时，挤掉优先级较低的普通任务并顺延。</li>
          <li>· 多个测试同时到期时，按漏洞严重程度排序：错误率 × 章节权重 × 后续影响。</li>
          <li>· 手动设置的优先级不会被自动覆盖；AI 想改需先征求同意。</li>
          <li>· 手动安排的待确认测试到期后，自动进入当天任务列表。</li>
        </ul>
      </div>
    </div>
  );
}
