import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { gradeShortAnswer } from "@/lib/deepseek";
import { onWrong } from "@/lib/sm2";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AnswerInput {
  questionId: string;
  userAnswer: string | null;
  timeSpentSeconds: number;
}

function normalize(v: string): string {
  return (v || "").trim().replace(/\s+/g, "").toLowerCase();
}

function gradeDeterministic(q: Question, userAnswer: string | null): boolean {
  const ua = (userAnswer || "").trim();
  const correct = q.correct_answer;
  switch (q.question_type) {
    case "single_choice":
    case "true_false":
      return normalize(ua) === normalize(correct);
    case "multiple_choice": {
      const a = ua.split("").filter((c) => /[a-d]/i.test(c)).sort().join("").toLowerCase();
      const b = correct.split("").filter((c) => /[a-d]/i.test(c)).sort().join("").toLowerCase();
      return a.length > 0 && a === b;
    }
    case "fill_blank":
      return normalize(ua) === normalize(correct);
    default:
      return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { paperId, answers } = body as { paperId: string; answers: AnswerInput[] };
    if (!paperId || !Array.isArray(answers)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 取整卷题目（含答案与解析）
    const { data: pq } = await sb
      .from("paper_questions")
      .select("sort_order, questions(*)")
      .eq("paper_id", paperId)
      .order("sort_order");

    const questions = ((pq as unknown as Array<{ questions: Question | null }> | undefined) || [])
      .map((r) => r.questions)
      .filter(Boolean) as Question[];

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));

    const results: Array<{
      question: Question;
      userAnswer: string | null;
      isCorrect: boolean;
      timeSpentSeconds: number;
      aiScorePercent: number | null;
      aiComment: string | null;
    }> = [];

    let correctCount = 0;

    for (const q of questions) {
      const input = answerMap.get(q.id);
      const userAnswer = input?.userAnswer ?? null;
      const timeSpent = input?.timeSpentSeconds ?? 0;

      let isCorrect = false;
      let aiScore: number | null = null;
      let aiComment: string | null = null;

      if (q.question_type === "short_answer") {
        const g = await gradeShortAnswer({
          questionText: q.question_text,
          correctAnswer: q.correct_answer,
          userAnswer: userAnswer || "",
        });
        aiScore = g.score;
        aiComment = g.comment;
        isCorrect = g.score >= 60;
      } else {
        isCorrect = gradeDeterministic(q, userAnswer);
      }
      if (isCorrect) correctCount++;

      results.push({ question: q, userAnswer, isCorrect, timeSpentSeconds: timeSpent, aiScorePercent: aiScore, aiComment });

      // 写入答题记录
      await sb.from("answer_records").insert({
        paper_id: paperId,
        question_id: q.id,
        user_answer: userAnswer,
        is_correct: isCorrect,
        time_spent_seconds: timeSpent,
        ai_score_percent: aiScore,
        ai_comment: aiComment,
      });

      // 错题本
      if (!isCorrect) {
        const { data: existing } = await sb
          .from("wrong_answers")
          .select("*")
          .eq("question_id", q.id)
          .maybeSingle();
        const sm2 = onWrong({
          ease_factor: Number(existing?.ease_factor || 2.5),
          interval_step: Number(existing?.interval_step || 0),
        });
        if (existing) {
          await sb
            .from("wrong_answers")
            .update({
              wrong_count: Number(existing.wrong_count || 1) + 1,
              last_wrong_at: new Date().toISOString(),
              mastered: false,
              next_review_at: sm2.next_review_at.toISOString(),
              ease_factor: sm2.ease_factor,
            })
            .eq("id", existing.id);
        } else {
          await sb.from("wrong_answers").insert({
            question_id: q.id,
            wrong_count: 1,
            last_wrong_at: new Date().toISOString(),
            mastered: false,
            next_review_at: sm2.next_review_at.toISOString(),
            ease_factor: sm2.ease_factor,
          });
        }
      }
    }

    // 知识点得分率
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id))];
    const { data: kpData } = await sb
      .from("knowledge_points")
      .select("id,content")
      .in("id", kpIds);
    const kpMap = new Map((kpData || []).map((k) => [k.id, k.content]));

    const kpStatMap = new Map<string, { kpId: string; content: string; total: number; correct: number }>();
    for (const r of results) {
      const kpId = r.question.knowledge_point_id;
      const stat = kpStatMap.get(kpId) || { kpId, content: kpMap.get(kpId) || "", total: 0, correct: 0 };
      stat.total++;
      if (r.isCorrect) stat.correct++;
      kpStatMap.set(kpId, stat);
    }

    const total = questions.length;
    return NextResponse.json({
      summary: {
        total,
        correct: correctCount,
        accuracy: total ? Math.round((correctCount / total) * 100) : 0,
      },
      results,
      kpStats: [...kpStatMap.values()],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "判分失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
