"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Lightbulb, MessageCircle, Send } from "lucide-react";

interface TeachingMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  created_at?: string;
}

interface Session {
  id: string;
  status: "active" | "done" | "abandoned";
  step: number;
  hint_level: number;
}

export function TeachingPanel({ kpId, kpName }: { kpId: string; kpName: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<TeachingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/kp/teach?kpId=${encodeURIComponent(kpId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "教学会话读取失败");
        setSession(result.session);
        setMessages(result.messages || []);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "教学会话读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kpId]);

  async function act(action: "start" | "reply" | "hint" | "solution", message = "") {
    setBusy(true);
    setError("");
    setWarning("");
    try {
      const response = await fetch("/api/kp/teach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpId, sessionId: session?.id, action, message }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "教学请求失败");
      setSession(result.session);
      setWarning(result.warning || "");
      setMessages((current) => [
        ...current,
        ...(action === "reply"
          ? [{ id: `user-${Date.now()}`, role: "user" as const, content: message }]
          : []),
        { id: `assistant-${Date.now()}`, role: "assistant", content: result.assistantMessage },
      ]);
      if (action === "reply") setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "教学请求失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle size={15} />
          </span>
          <div>
            <h2 className="text-[13.5px] font-semibold">互动学习 · {kpName}</h2>
            <p className="text-[11px] text-muted-foreground">逐步讲解与提问；完成教学不代表已经掌握</p>
          </div>
        </div>
        {session && <span className="kp-chip">第 {session.step} 步</span>}
      </header>

      {error && <div role="alert" className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</div>}
      {warning && <div role="status" className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{warning}</div>}

      <div className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-[12.5px] text-muted-foreground">正在读取教学会话…</p>
        ) : messages.length === 0 ? (
          <div className="rounded-xl bg-white/65 p-4 text-[12.5px] leading-relaxed text-muted-foreground">
            老师会根据这个知识点逐步讲解，每次只推进一个小步骤，并通过提问检查理解。对话会保存在学习记录中。
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-relaxed ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-white/75 text-foreground"}`}>
                {message.content}
              </div>
            </div>
          ))
        )}
        {session?.status === "done" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] leading-relaxed text-emerald-800">
            本轮教学已结束。请用专项测试验证理解；系统不会仅凭教学对话将知识点标记为已掌握。
          </div>
        )}
      </div>

      <footer className="border-t border-border/70 bg-white/35 px-4 py-3">
        {loading ? null : !session ? (
          <button type="button" disabled={busy} onClick={() => void act("start")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50">
            <BookOpen size={14} /> {busy ? "正在准备课程…" : "开始分步学习"}
          </button>
        ) : session.status === "done" ? (
          <Link href={`/learning?tab=tests&kp=${encodeURIComponent(kpId)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground">
            去做专项测试 <ArrowRight size={13} />
          </Link>
        ) : (
          <div className="space-y-2">
            <form onSubmit={(event) => { event.preventDefault(); if (draft.trim() && !busy) void act("reply", draft.trim()); }} className="flex gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={3000} disabled={busy} placeholder="写下你的想法或答案…" className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:border-primary/50 disabled:opacity-60" />
              <button type="submit" disabled={busy || !draft.trim()} aria-label="发送回答" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-45">
                <Send size={14} />
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || session.hint_level >= 3} onClick={() => void act("hint")} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/75 px-2.5 py-1.5 text-[11.5px] text-foreground/80 disabled:opacity-45">
                <Lightbulb size={12} /> {session.hint_level >= 3 ? "已用完提示" : "给我提示"}
              </button>
              <button type="button" disabled={busy} onClick={() => void act("solution")} className="rounded-lg border border-border bg-white/75 px-2.5 py-1.5 text-[11.5px] text-foreground/80 disabled:opacity-45">
                查看完整讲解
              </button>
              {busy && <span className="self-center text-[11.5px] text-muted-foreground">老师正在思考…</span>}
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
