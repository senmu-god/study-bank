"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { formatDateTime } from "@/lib/utils";

interface WrongItem {
  id: string;
  wrong_count: number;
  last_wrong_at: string;
  mastered: boolean;
  next_review_at: string | null;
  questions: {
    question_text: string;
    correct_answer: string;
    question_type: string;
  } | null;
}

export default function WrongAnswersPage() {
  const [items, setItems] = useState<WrongItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/wrong-answers");
    const d = await r.json();
    setItems(d.items || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function markMastered(id: string, mastered: boolean) {
    await fetch("/api/wrong-answers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, mastered }),
    });
    load();
  }

  async function makeReviewPaper() {
    const r = await fetch("/api/papers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "错题复习卷", totalQuestions: 20, fromWrong: true, paperType: "review", kpConfig: [], typeRatios: { single_choice: 0, multiple_choice: 0, fill_blank: 0, true_false: 0, short_answer: 0 }, difficultyRange: "mixed" }),
    });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    location.href = `/exam/${d.paperId}`;
  }

  const pending = items.filter((i) => !i.mastered);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">错题本（{pending.length} 道待复习）</h1>
        <Button onClick={makeReviewPaper}>生成复习卷</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">暂无错题，继续保持</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((w) => (
            <Card key={w.id} className={w.mastered ? "opacity-50" : ""}>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">错 {w.wrong_count} 次</Badge>
                  <span className="text-xs text-muted-foreground">上次：{formatDateTime(w.last_wrong_at)}</span>
                  {w.next_review_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(w.next_review_at) <= new Date() ? "现在可复习" : `下次：${formatDateTime(w.next_review_at)}`}
                    </span>
                  )}
                </div>
                <p className="font-medium">{w.questions?.question_text}</p>
                <div className="text-xs text-muted-foreground">
                  正确答案：{w.questions?.correct_answer}
                </div>
                <Button size="sm" variant="outline" onClick={() => markMastered(w.id, !w.mastered)}>
                  {w.mastered ? "取消掌握标记" : "标记为已掌握"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
