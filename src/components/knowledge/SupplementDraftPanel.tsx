"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react";

const TYPES = [
  ["single_choice", "单选"], ["multiple_choice", "多选"], ["fill_blank", "填空"],
  ["true_false", "判断"], ["short_answer", "简答"], ["design", "应用题"],
] as const;

type Draft = { id: string; state: string; question_type: string; payload: { question_text: string; options?: { label: string; text: string }[]; correct_answer: string; explanation: string; difficulty: string }; checks: Record<string, boolean> };

export function SupplementDraftPanel({ kpId, kpName, questionCount, onDone }: { kpId: string; kpName: string; questionCount: number; onDone?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number][0]>("short_answer");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!expanded || draft) return;
    let active = true;
    fetch(`/api/kp/drafts?kpId=${encodeURIComponent(kpId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        if (!active) return;
        if (result.ok) setDraft((result.drafts || []).find((item: Draft) => item.state === "draft") || null);
        else setError(result.error || "候选题读取失败");
      })
      .catch(() => active && setError("候选题读取失败"));
    return () => { active = false; };
  }, [expanded, kpId, draft]);

  async function generate() {
    const accepted = window.confirm(`将把知识点「${kpName}」及最多 50 道关联题目的题干摘要发送给服务端配置的 AI，用于生成 1 道候选题。答案和答题记录不会发送。生成结果先由你检查，不会自动进入正式题库。继续吗？`);
    if (!accepted) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/kp/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kpId, questionType: type, difficulty: "medium", consent: true }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "候选题生成失败");
      setDraft(result.draft);
    } catch (e) { setError(e instanceof Error ? e.message : "候选题生成失败"); }
    finally { setBusy(false); }
  }

  async function finish(action: "publish" | "reject") {
    if (!draft) return;
    if (action === "publish" && !window.confirm("我已检查题干、选项、标准答案与解析。确认写入正式题库？写入后它会参与组卷和统计。")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/kp/drafts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: draft.id, action, confirm: action === "publish" }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "候选题处理失败");
      setDraft(null); setMessage(action === "publish" ? "题目已写入题库，刷新后可用于专项测试。" : "候选题已归档为拒绝，不会进入题库。");
      if (action === "publish") onDone?.();
    } catch (e) { setError(e instanceof Error ? e.message : "候选题处理失败"); }
    finally { setBusy(false); }
  }

  return <div className="mt-2 w-full rounded-xl border border-border/70 bg-white/50 p-2.5">
    <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-muted-foreground">题目覆盖不足时，可生成候选补充题。当前 {questionCount} 道。</span><button type="button" onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-primary"><Sparkles size={12} />{expanded ? "收起" : "生成候选题"}</button></div>
    {expanded && <div className="mt-2 space-y-2">
      {!draft && <div className="flex flex-wrap items-center gap-2"><select value={type} onChange={(event) => setType(event.target.value as typeof type)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-[11.5px]">{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" disabled={busy} onClick={() => void generate()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}生成 1 道候选题</button></div>}
      {draft && <div className="rounded-lg border border-primary/15 bg-white p-3 text-[12px]"><div className="mb-2 flex items-center gap-2 text-[10.5px] text-muted-foreground"><span>{TYPES.find(([v]) => v === draft.question_type)?.[1] || draft.question_type}</span><span>·</span><span>难度 {draft.payload.difficulty}</span><span className="ml-auto inline-flex items-center gap-1 text-amber-700"><CheckCircle2 size={12} />结构检查通过，仍需人工复核</span></div><div className="font-medium leading-relaxed">{draft.payload.question_text}</div>{draft.payload.options?.map((option) => <div key={option.label} className="mt-1 pl-2 text-muted-foreground">{option.label}. {option.text}</div>)}<details className="mt-2"><summary className="cursor-pointer text-[11px] text-primary">检查标准答案与解析</summary><div className="mt-2 whitespace-pre-wrap rounded bg-secondary/60 p-2 text-[11.5px]"><b>参考答案：</b>{draft.payload.correct_answer}<br /><b>解析：</b>{draft.payload.explanation}</div></details><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void finish("publish")} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground">检查后写入正式题库</button><button type="button" disabled={busy} onClick={() => void finish("reject")} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-[11px]"><X size={12} />拒绝</button></div></div>}
      {message && <p className="text-[11px] text-emerald-700">{message}</p>}{error && <p role="alert" className="text-[11px] text-rose-700">{error}</p>}
    </div>}
  </div>;
}
