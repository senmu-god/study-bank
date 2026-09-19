"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/controls";
import type { GenTask } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import KnowledgeTreeSelector from "@/components/KnowledgeTreeSelector";

const CONCURRENCY = 4;

interface FailItem { task: GenTask; error: string; }

interface SubjectNode {
  id: string; name: string;
  chapters: { id: string; name: string; sections: { id: string; name: string; kps: { id: string; content: string; source_date: string }[] }[] }[];
}

export default function GeneratePage() {
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<GenTask[]>([]);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<FailItem[]>([]);
  const [success, setSuccess] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [finished, setFinished] = useState<null | { ok: number; fail: number }>(null);

  const [tree, setTree] = useState<SubjectNode[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/knowledge/tree").then((r) => r.json()).then((d) => setTree(d.tree || []));
  }, []);

  async function worker(taskQueue: GenTask[]) {
    while (taskQueue.length > 0) {
      const task = taskQueue.shift();
      if (!task) break;
      try {
        const r = await fetch("/api/generate/one", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task }),
        });
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        setSuccess((s) => s + 1);
        setLog((l) => [...l, `✓ ${task.kpContent.slice(0, 20)}`]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "失败";
        setFailed((f) => [...f, { task, error: message }]);
        setLog((l) => [...l, `✗ ${task.kpContent.slice(0, 20)}：${message}`]);
      } finally {
        setDone((d) => d + 1);
      }
    }
  }

  async function start() {
    if (checked.size > 50) {
      alert(`请分批生成，每次最多50个知识点（当前已选 ${checked.size} 个）`);
      return;
    }
    setRunning(true);
    setFinished(null);
    setDone(0); setSuccess(0); setFailed([]); setLog(["正在生成出题计划…"]);
    try {
      const scopeParam = checked.size > 0 ? { kpIds: [...checked] } : {};
      const planRes = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCount: 24, ...scopeParam }),
      });
      const planData = await planRes.json();
      if (planData.error) {
        setLog((l) => [...l, `✗ ${planData.error}`]);
        setRunning(false);
        return;
      }
      const tasks: GenTask[] = planData.tasks || [];
      if (tasks.length === 0) {
        setLog(["范围内没有可用知识点（可能都已有5题以上）。请先导入新知识点，或扩大选择范围。"]);
        setRunning(false);
        return;
      }
      setPlan(tasks);
      setLog((l) => [...l, `计划生成 ${tasks.length} 题，开始并发生成…`]);
      const queue = [...tasks];
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
      setRunning(false);
      setTimeout(() => {
        setSuccess((curOk) => {
          setFailed((curFail) => {
            setFinished({ ok: curOk, fail: curFail.length });
            return curFail;
          });
          return curOk;
        });
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "网络错误";
      setLog((l) => [...l, `✗ 请求失败：${message}`]);
      setRunning(false);
    }
  }

  async function retryFailed() {
    if (failed.length === 0) return;
    const retryTasks = failed.map((f) => f.task);
    setFailed([]);
    setFinished(null);
    setRunning(true);
    const queue = [...retryTasks];
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
    setRunning(false);
    setTimeout(() => {
      setSuccess((curOk) => {
        setFailed((curFail) => {
          setFinished({ ok: curOk, fail: curFail.length });
          return curFail;
        });
        return curOk;
      });
    }, 100);
  }

  const total = plan.length || 0;
  const progressDone = Math.min(done, total);
  const progressPct = total > 0 ? Math.min(100, (progressDone / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">AI 生成今日题目</h1>

      <Card>
        <CardHeader>
          <CardTitle>选择生成范围（已选 {checked.size} 个知识点）</CardTitle>
        </CardHeader>
        <CardContent>
          <KnowledgeTreeSelector tree={tree} checked={checked} onChange={setChecked} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            默认生成 24 题：今日新知识点约 60%，历史知识点约 40%。已有5题以上的知识点自动跳过。
            {checked.size === 0 && <span className="text-orange-600">（未选范围则全库随机）</span>}
          </p>
          <Button onClick={start} disabled={running}>
            {running ? "生成中…" : "生成今日题目"}
          </Button>
          {total > 0 && (
            <div className="space-y-2">
              <div className="text-sm">
                进度：{progressDone}/{total}　成功 {success}　失败 {failed.length}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {finished && !running && (
        <div className="rounded-md border border-green-500/50 bg-green-50 p-4 text-sm">
          <div className="font-medium text-green-700">
            ✅ 生成完成！在 {checked.size > 0 ? `所选 ${checked.size} 个知识点范围` : "全库"} 内成功 {finished.ok} 题，失败 {finished.fail} 题。
          </div>
          {finished.fail > 0 && <div className="mt-1 text-xs text-muted-foreground">失败题目见下方，可点"一键重试"。</div>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => (window.location.href = "/questions")}>查看题库</Button>
          </div>
        </div>
      )}

      {failed.length > 0 && !running && (
        <Card>
          <CardHeader><CardTitle>失败题目（{failed.length}）</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {failed.map((f, i) => (
              <div key={i} className="rounded-md border border-destructive/30 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">{QUESTION_TYPE_LABELS[f.task.questionType]}</Badge>
                  <span>{f.task.kpContent}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{f.error}</div>
              </div>
            ))}
            <Button variant="outline" onClick={retryFailed}>一键重试失败项</Button>
          </CardContent>
        </Card>
      )}

      {log.length > 0 && (
        <Card>
          <CardHeader><CardTitle>生成日志</CardTitle></CardHeader>
          <CardContent>
            <pre className="max-h-64 overflow-auto text-xs text-muted-foreground">{log.join("\n")}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
