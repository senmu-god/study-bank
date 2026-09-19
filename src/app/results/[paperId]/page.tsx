"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { QUESTION_TYPE_LABELS } from "@/lib/types";

interface ResultItem {
  question: {
    id: string;
    question_type: string;
    question_text: string;
    options: { label: string; text: string }[] | null;
    correct_answer: string;
    explanation: string;
  };
  userAnswer: string | null;
  isCorrect: boolean;
  timeSpentSeconds: number;
  aiScorePercent: number | null;
  aiComment: string | null;
  points: number;
  earned: number;
}

export default function ResultsPage() {
  const params = useParams();
  const paperId = params.paperId as string;
  const [data, setData] = useState<{
    summary: { total: number; correct: number; accuracy: number; score: number; fullScore: number };
    results: ResultItem[];
    kpStats: { kpId: string; content: string; total: number; correct: number }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/exam/results/${paperId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch((e) => setError("加载失败：" + e.message));
  }, [paperId]);

  if (error) return <p className="text-sm text-destructive">加载成绩失败：{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">成绩</h1>
        <Link href="/wrong-answers"><Button variant="outline">错题重练</Button></Link>
      </div>

      <Card>
        <CardContent className="flex items-center gap-8 p-6">
          <div>
            <div className="text-4xl font-bold text-primary">{data.summary.score}
              <span className="text-lg text-muted-foreground"> / {data.summary.fullScore} 分</span>
            </div>
            <div className="text-sm text-muted-foreground">总分</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.summary.accuracy}%</div>
            <div className="text-sm text-muted-foreground">得分率</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.summary.correct} / {data.summary.total}</div>
            <div className="text-sm text-muted-foreground">答对题数</div>
          </div>
        </CardContent>
      </Card>

      {data.kpStats.length > 0 && (
        <Card>
          <CardHeader><CardTitle>各知识点得分率</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.kpStats.map((k) => {
              const pct = k.total ? Math.round((k.correct / k.total) * 100) : 0;
              return (
                <div key={k.kpId}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span>{k.content}</span>
                    <span>{k.correct}/{k.total}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={pct >= 60 ? "h-full bg-primary" : "h-full bg-destructive"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data.results.map((r, i) => (
          <Card key={r.question.id}>
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={r.isCorrect ? "default" : "destructive"}>
                  {r.isCorrect ? "正确" : "错误"}
                </Badge>
                <Badge variant="secondary">{QUESTION_TYPE_LABELS[r.question.question_type as keyof typeof QUESTION_TYPE_LABELS]}</Badge>
                <span className="text-xs text-muted-foreground">{r.earned}/{r.points}分</span>
                <span className="text-xs text-muted-foreground">耗时 {r.timeSpentSeconds}s</span>
              </div>
              <p className="font-medium">{i + 1}. {r.question.question_text}</p>
              {r.question.options && (
                <ul className="ml-4 space-y-1 text-muted-foreground">
                  {r.question.options.map((o) => (
                    <li key={o.label}>{o.label}. {o.text}</li>
                  ))}
                </ul>
              )}
              <div className="text-xs">
                <span className="text-muted-foreground">你的答案：</span>
                <span className={r.isCorrect ? "text-primary" : "text-destructive"}>
                  {r.userAnswer || "（未作答）"}
                </span>
                {r.aiScorePercent !== null && (
                  <span className="ml-2">AI 评分：{r.aiScorePercent} 分</span>
                )}
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">正确答案：</span>
                {r.question.correct_answer}
              </div>
              {r.aiComment && <div className="text-xs text-muted-foreground">评语：{r.aiComment}</div>}
              <div className="rounded-md bg-secondary p-2 text-xs">
                <span className="font-medium">解析：</span>
                {r.question.explanation}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
