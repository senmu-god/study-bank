"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

interface Paper {
  id: string;
  title: string;
  total_questions: number;
  difficulty_level: string | null;
  paper_type: string;
  created_at: string;
}

export default function PapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/papers/list")
      .then((r) => r.json())
      .then((d) => setPapers(d.papers || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的试卷</h1>
        <Link href="/create-paper"><Button>新建试卷</Button></Link>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : papers.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">暂无试卷</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {papers.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{p.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {p.total_questions} 题 · {p.difficulty_level || "混合"} · {formatDateTime(p.created_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/exam/${p.id}`}><Button size="sm">开始答题</Button></Link>
                  <Link href={`/paper/${p.id}/preview`}><Button size="sm" variant="outline">预览/导出</Button></Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
