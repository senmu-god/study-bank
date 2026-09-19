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

    // 取整卷题目（含答案与解析、每题分值）
    const { data: pq } = await sb
      .from("paper_questions")
      .select("sort_order, points, questions(*)")
      .eq("paper_id", paperId)
      .order("sort_order");

    const rows = ((pq as unknown as Array<{ questions: Question | null; points: number | null }> | undefined) || [])
      .filter((r) => r.questions);
    const questions = rows.map((r) => r.questions!) as Question[];
    const pointOf = (qid: string) => rows.find((r) => r.questions?.id === qid)?.points ?? 1;

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));

    const results: Array<{
      question: Question;
      userAnswer: string | null;
      isCorrect: boolean;
      timeSpentSeconds: number;
      aiScorePercent: number | null;
      aiComment: string | null;
      points: number;
      earned: number;
    }> = [];

    let correctCount = 0;
    let totalScore = 0;
    let fullScore = 0;

    for (const q of questions) {
      const input = answerMap.get(q.id);
      const userAnswer = input?.userAnswer ?? null;
      const timeSpent = input?.timeSpentSeconds ?? 0;
      const points = pointOf(q.id);
      fullScore += points;

      let isCorrect = false;
      let aiScore: number | null = null;
      let aiComment: string | null = null;
      let earned = 0;

      if (q.question_type === "short_answer" || q.question_type === "design") {
        const g = await gradeShortAnswer({
          questionText: q.question_text,
          correctAnswer: q.correct_answer,
          userAnswer: userAnswer || "",
        });
        aiScore = g.score;
        aiComment = g.comment;
        isCorrect = g.score >= 60;
        earned = Math.round((points * g.score) / 100);
      } else {
        isCorrect = gradeDeterministic(q, userAnswer);
        earned = isCorrect ? points : 0;
      }
      if (isCorrect) correctCount++;
      totalScore += earned;

      results.push({ question: q, userAnswer, isCorrect, timeSpentSeconds: timeSpent, aiScorePercent: aiScore, aiComment, points, earned });

      // 写入答题记录
      const { error: insErr } = await sb.from("answer_records").insert({
        paper_id: paperId,
        question_id: q.id,
        user_answer: userAnswer,
        is_correct: isCorrect,
        time_spent_seconds: timeSpent,
      });
      if (insErr) throw new Error(`写入答题记录失败: ${insErr.message}`);

      // 错题本：UPSERT 逻辑，避免重复插入
      if (!isCorrect) {
        const { data: existing } = await sb
          .from("wrong_answers")
          .select("id,wrong_count,ease_factor")
          .eq("question_id", q.id)
          .maybeSingle();
        const newCount = existing ? Number(existing.wrong_count || 1) + 1 : 1;
        const sm2 = onWrong({
          ease_factor: Number(existing?.ease_factor || 2.5),
          interval_step: 0,
        });
        const { error: waErr } = await sb
          .from("wrong_answers")
          .upsert(
            {
              question_id: q.id,
              wrong_count: newCount,
              last_wrong_at: new Date().toISOString(),
              mastered: false,
              next_review_at: sm2.next_review_at.toISOString(),
              ease_factor: sm2.ease_factor,
            },
            { onConflict: "question_id" }
          );
        if (waErr) throw new Error(`写入错题本失败: ${waErr.message}`);
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

    // 查试卷类型
    const { data: paperRow } = await sb.from("papers").select("id,title,paper_type").eq("id", paperId).single();
    const isMock = paperRow?.paper_type === "mock";

    const total = questions.length;
    const accuracy = fullScore ? Math.round((totalScore / fullScore) * 100) : 0;
    const totalTime = results.reduce((s, r) => s + (r.timeSpentSeconds || 0), 0);

    // 模考：生成分析记录
    let analysis = null;
    if (isMock) {
      const weakPoints = [...kpStatMap.values()]
        .filter((k) => k.correct / k.total < 0.6)
        .map((k) => ({ kpId: k.kpId, content: k.content, rate: Math.round((k.correct / k.total) * 100) }));
      const { data: analysisRow } = await sb
        .from("mock_exam_analyses")
        .insert({
          paper_id: paperId,
          total_score: totalScore,
          correct_rate: accuracy,
          time_spent: totalTime,
          weak_points: weakPoints,
        })
        .select("id")
        .single();
      if (analysisRow) analysis = { id: analysisRow.id, weakPoints };
    }

    return NextResponse.json({
      summary: { total, correct: correctCount, accuracy, score: totalScore, fullScore, timeSpent: totalTime },
      results,
      kpStats: [...kpStatMap.values()],
      analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "判分失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
