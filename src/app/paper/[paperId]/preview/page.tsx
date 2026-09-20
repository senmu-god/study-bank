"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/controls";
import type { Question } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import MathText from "@/components/MathText";
import { exportWord } from "@/lib/wordExport";

type Mode = "blank" | "answer" | "explain";

export default function PaperPreviewPage() {
  const params = useParams();
  const paperId = params.paperId as string;
  const [paper, setPaper] = useState<{ title: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mode, setMode] = useState<Mode>("blank");

  useEffect(() => {
    fetch(`/api/papers/${paperId}`)
      .then((r) => r.json())
      .then((d) => {
        setPaper(d.paper);
        setQuestions(d.questions || []);
      });
  }, [paperId]);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">试卷预览</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          {(["blank", "answer", "explain"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={m === mode ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" : "rounded-md bg-secondary px-3 py-1.5 text-sm"}
            >
              {m === "blank" ? "空卷" : m === "answer" ? "答案卷" : "解析卷"}
            </button>
          ))}
          <Button onClick={() => window.print()}>导出 PDF</Button>
          <Button variant="outline" onClick={() => exportWord(paper!, questions, "blank")}>Word 空卷</Button>
          <Button variant="outline" onClick={() => exportWord(paper!, questions, "answer")}>Word 答案卷</Button>
          <Button variant="outline" onClick={() => exportWord(paper!, questions, "explain")}>Word 解析卷</Button>
        </div>
      </div>

      <Card className="print-area">
        <CardContent className="p-8">
          <h2 className="mb-6 text-center text-xl font-bold">
            {paper?.title}（{mode === "blank" ? "空卷" : mode === "answer" ? "答案卷" : "解析卷"}）
          </h2>
          <div className="space-y-6">
            {questions.map((q, i) => (
              <div key={q.id}>
                <div className="text-sm text-muted-foreground">
                  {QUESTION_TYPE_LABELS[q.question_type]}
                </div>
                <p className="mt-1 font-medium">{i + 1}. <MathText content={q.question_text} /></p>
                {q.options && (
                  <div className="mt-2 space-y-1 pl-4 text-sm text-muted-foreground">
                    {q.options.map((o) => <div key={o.label}>{o.label}. <MathText content={o.text} /></div>)}
                  </div>
                )}
                {(mode === "answer" || mode === "explain") && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-primary">答案：</span><MathText content={q.correct_answer} />
                  </div>
                )}
                {mode === "explain" && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium">解析：</span><MathText content={q.explanation} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
