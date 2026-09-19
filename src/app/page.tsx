"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Layers, Sparkles, FileText, BookmarkX, AlarmClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Stats {
  subjects: number;
  knowledgePoints: number;
  questions: number;
  wrongPending: number;
  dueForReview: number;
  recentPapers: { id: string; title: string; created_at: string }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [generatingMock, setGeneratingMock] = useState(false);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  async function generateMock(variant: string = "") {
    setGeneratingMock(true);
    const body: Record<string, string> = variant ? { variant } : {};
    const r = await fetch("/api/papers/mock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setGeneratingMock(false);
    if (d.error) { alert("生成失败：" + d.error); return; }
    if (d.gaps && d.gaps.length > 0) alert("部分题型题量不足：" + d.gaps.join("、"));
    window.location.href = `/exam/${d.paperId}`;
  }

  const cards = [
    { label: "科目", value: stats?.subjects ?? "-", icon: BookOpen },
    { label: "知识点", value: stats?.knowledgePoints ?? "-", icon: Layers },
    { label: "题库题目", value: stats?.questions ?? "-", icon: Sparkles },
    { label: "待复习错题", value: stats?.dueForReview ?? "-", icon: AlarmClock },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">仪表盘</h1>
        <p className="text-sm text-muted-foreground">每日流程：导入知识点 → AI 出题 → 组卷 → 答题 → 错题复习</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <c.icon size={18} />
              </span>
              <div>
                <div className="text-2xl font-bold">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>快捷操作</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button className="w-full justify-start" onClick={() => generateMock("")} disabled={generatingMock}>
              {generatingMock ? "正在生成…" : "生成模考试卷（24题）"}
            </Button>
            <Button className="w-full justify-start" onClick={() => generateMock("computer150")} disabled={generatingMock}>
              {generatingMock ? "正在生成…" : "生成计算机基础模考（150分）"}
            </Button>
            <Link href="/knowledge/import"><Button className="w-full justify-start" variant="outline">批量导入知识点</Button></Link>
            <Link href="/generate"><Button className="w-full justify-start" variant="outline">生成今日题目</Button></Link>
            <Link href="/create-paper"><Button className="w-full justify-start" variant="outline">新建试卷</Button></Link>
            <Link href="/mock-exams"><Button className="w-full justify-start" variant="outline">模考记录</Button></Link>
            <Link href="/wrong-answers"><Button className="w-full justify-start" variant="outline">复习错题（{stats?.dueForReview ?? 0}）</Button></Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近试卷</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.recentPapers || []).length === 0 && (
              <p className="text-sm text-muted-foreground">还没有试卷，去「组卷」生成第一张吧。</p>
            )}
            {(stats?.recentPapers || []).map((p) => (
              <Link
                key={p.id}
                href={`/paper/${p.id}/preview`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  {p.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("zh-CN")}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
