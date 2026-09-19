"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/controls";
import type { GenTask } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";

const CONCURRENCY = 4;

interface FailItem {
  task: GenTask;
  error: string;
}

export default function GeneratePage() {
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<GenTask[]>([]);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<FailItem[]>([]);
  const [success, setSuccess] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [finished, setFinished] = useState<null | { ok: number; fail: number }>(null);

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
    setRunning(true);
    setFinished(null);
    setDone(0); setSuccess(0); setFailed([]); setLog(["正在生成出题计划…"]);
    try {
      const planRes = await fetch("/api/generate/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCount: 24 }),
      });
      const planData = await planRes.json();
      if (planData.error) {
        setLog((l) => [...l, `✗ ${planData.error}`]);
        setRunning(false);
        return;
      }
      const tasks: GenTask[] = planData.tasks || [];
      if (tasks.length === 0) {
        setLog(["没有可用的知识点来出题。请先在「知识点」页面导入一些知识点。"]);
        setRunning(false);
        return;
      }
      setPlan(tasks);
      setLog((l) => [...l, `计划生成 ${tasks.length} 题，开始并发生成…`]);
      // 共享同一个队列，worker 从队列里 shift，避免重复生成
      const queue = [...tasks];
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
      setRunning(false);
      // 完成提示（读取最新 state）
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
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            默认生成 24 题：今日新知识点约占 60%，历史知识点约占 40%。每个知识点生成 1 道题，题型随机。
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
          <div className="font-medium text-green-700">✅ 生成完成！成功 {finished.ok} 题，失败 {finished.fail} 题。</div>
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
