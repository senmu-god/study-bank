"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { Badge } from "@/components/ui/controls";
import { QUESTION_TYPE_LABELS } from "@/lib/types";
import type { QuestionType } from "@/lib/types";

interface ExamQuestion {
  id: string;
  question_type: QuestionType;
  question_text: string;
  options: { label: string; text: string }[] | null;
}

export default function ExamPage() {
  const params = useParams();
  const router = useRouter();
  const paperId = params.paperId as string;

  const [paper, setPaper] = useState<{ title: string } | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, string>>({});
  const [timeSpent, setTimeSpent] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const enterTime = useRef(Date.now());

  useEffect(() => {
    fetch(`/api/papers/${paperId}/exam`)
      .then((r) => r.json())
      .then((d) => {
        setPaper(d.paper);
        setQuestions(d.questions || []);
      });
  }, [paperId]);

  function recordTime() {
    const q = questions[index];
    if (!q) return;
    const sec = Math.round((Date.now() - enterTime.current) / 1000);
    setTimeSpent((t) => ({ ...t, [q.id]: (t[q.id] || 0) + sec }));
    enterTime.current = Date.now();
  }

  function go(next: number) {
    recordTime();
    setIndex(next);
  }

  function setAnswer(qid: string, val: string) {
    setAnswers((a) => ({ ...a, [qid]: val }));
  }

  function handleImageUpload(qid: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setImages((prev) => ({ ...prev, [qid]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    recordTime();

    // 先处理有图片的简答题：调用图片判分接口
    const imageQids = Object.keys(images).filter((qid) => images[qid]);
    for (const qid of imageQids) {
      const q = questions.find((x) => x.id === qid);
      if (!q) continue;
      try {
        await fetch("/api/exam/submit-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperId,
            questionId: qid,
            imageBase64: images[qid],
            userAnswer: answers[qid] || "",
            questionText: q.question_text,
            correctAnswer: "",
          }),
        });
      } catch {}
    }

    const payload = {
      paperId,
      answers: questions.map((q) => ({
        questionId: q.id,
        userAnswer: answers[q.id] ?? null,
        timeSpentSeconds: timeSpent[q.id] || 0,
      })),
    };
    try {
      const r = await fetch("/api/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (d.error) {
        alert("提交失败：" + d.error);
        setSubmitting(false);
        return;
      }
      router.push(`/results/${paperId}`);
    } catch (err) {
      alert("网络错误，提交失败：" + (err instanceof Error ? err.message : ""));
      setSubmitting(false);
    }
  }

  if (questions.length === 0) return <p className="text-sm text-muted-foreground">加载中…</p>;
  const q = questions[index];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{paper?.title}</h1>
        <span className="text-sm text-muted-foreground">第 {index + 1} / {questions.length} 题</span>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Badge>{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
          </div>
          <p className="text-base leading-relaxed">{q.question_text}</p>

          {(q.question_type === "single_choice" || q.question_type === "multiple_choice") && (
            <div className="space-y-2">
              {(q.options || []).map((opt) => (
                <label
                  key={opt.label}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-secondary"
                >
                  <input
                    type={q.question_type === "single_choice" ? "radio" : "checkbox"}
                    name="opt"
                    checked={
                      q.question_type === "single_choice"
                        ? answers[q.id] === opt.label
                        : (answers[q.id] || "").includes(opt.label)
                    }
                    onChange={() => {
                      if (q.question_type === "single_choice") setAnswer(q.id, opt.label);
                      else {
                        const cur = answers[q.id] || "";
                        setAnswer(q.id, cur.includes(opt.label) ? cur.replace(opt.label, "") : cur + opt.label);
                      }
                    }}
                  />
                  <span className="font-medium">{opt.label}.</span>
                  <span>{opt.text}</span>
                </label>
              ))}
            </div>
          )}

          {q.question_type === "true_false" && (
            <div className="flex gap-3">
              {["对", "错"].map((v) => (
                <button
                  key={v}
                  onClick={() => setAnswer(q.id, v)}
                  className={
                    answers[q.id] === v
                      ? "rounded-md bg-primary px-6 py-2 text-primary-foreground"
                      : "rounded-md border border-border px-6 py-2"
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {(q.question_type === "fill_blank" || q.question_type === "short_answer" || q.question_type === "design") && (
            <>
              <Textarea
                rows={q.question_type === "fill_blank" ? 2 : 6}
                value={answers[q.id] || ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                placeholder={q.question_type === "fill_blank" ? "请输入答案" : "请作答（可上传手写/截图图片辅助判分）"}
              />
              {(q.question_type === "short_answer" || q.question_type === "design") && (
                <div className="space-y-2">
                  {images[q.id] ? (
                    <div className="flex items-center gap-3">
                      <img src={images[q.id]} alt="答案图片" className="h-32 rounded-md border" />
                      <Button size="sm" variant="outline" onClick={() => setImages((prev) => { const n = { ...prev }; delete n[q.id]; return n; })}>
                        删除重传
                      </Button>
                    </div>
                  ) : (
                    <label className="inline-block cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(q.id, f);
                        }}
                      />
                      <span className="inline-block rounded-md border border-border px-4 py-2 text-sm hover:bg-secondary">
                        上传图片（拍照/相册）
                      </span>
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={index === 0} onClick={() => go(index - 1)}>上一题</Button>
        {index < questions.length - 1 ? (
          <Button onClick={() => go(index + 1)}>下一题</Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "正在判分中…" : "提交试卷"}
          </Button>
        )}
      </div>
    </div>
  );
}
