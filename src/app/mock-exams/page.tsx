"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

interface Analysis {
  id: string;
  paper_id: string;
  total_score: number;
  correct_rate: number;
  time_spent: number;
  weak_points: { kpId: string; content: string; rate: number }[] | null;
  created_at: string;
  papers: { title: string; total_questions: number; created_at: string } | null;
}

export default function MockExamsPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/mock-analyses")
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">模考记录</h1>

      {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {analyses.length === 0 && !loading && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          还没有模考记录。去首页点"生成模考试卷"开始吧。
        </CardContent></Card>
      )}

      {/* 成绩趋势 */}
      {analyses.length >= 2 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-medium mb-3">正确率趋势</h3>
            <div className="flex items-end gap-2 h-32">
              {[...analyses].reverse().map((a, i) => (
                <div key={a.id} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-primary/70 rounded-t"
                    style={{ height: `${Number(a.correct_rate)}%` }}
                  />
                  <span className="text-xs mt-1">{Number(a.correct_rate)}%</span>
                  <span className="text-[10px] text-muted-foreground">{analyses.length - i}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {analyses.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{a.papers?.title || "模考"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDateTime(a.created_at)} · 得分 {a.total_score}/{a.papers?.total_questions} · 正确率 {Number(a.correct_rate)}% · 用时 {a.time_spent}秒
                  </div>
                </div>
                <Link href={`/results/${a.paper_id}`}>
                  <Button size="sm" variant="outline">查看详情</Button>
                </Link>
              </div>
              {a.weak_points && a.weak_points.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">薄弱知识点：</span>
                  {a.weak_points.map((w) => (
                    <span key={w.kpId} className="ml-2 text-xs text-red-600">{w.content}({w.rate}%)</span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
