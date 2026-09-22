import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateOneQuestion } from "@/lib/deepseek";
import type { GenTask } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST 生成单题：{ task: GenTask }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const task = body.task as GenTask;
    if (!task?.kpId || !task.kpContent) {
      return NextResponse.json({ error: "任务参数不完整" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 拉取该知识点已出题目摘要（避免重复）
    const { data: existing } = await sb
      .from("questions")
      .select("question_text")
      .eq("knowledge_point_id", task.kpId)
      .order("generated_at", { ascending: false })
      .limit(50);
    const existingSummary = (existing || [])
      .map((q, i) => `${i + 1}. ${q.question_text.slice(0, 80)}`)
      .join("；");

    const generated = await generateOneQuestion({
      subject: task.subject,
      chapter: task.chapter,
      section: task.section,
      kpContent: task.kpContent,
      questionType: task.questionType,
      difficulty: task.difficulty,
      existingSummary,
    });

    const { data, error } = await sb
      .from("questions")
      .insert({
        knowledge_point_id: task.kpId,
        question_type: task.questionType,
        question_text: generated.question_text,
        options: task.questionType === "single_choice" || task.questionType === "multiple_choice"
          ? generated.options
          : null,
        correct_answer: generated.correct_answer,
        explanation: generated.explanation,
        difficulty: generated.difficulty || task.difficulty,
        difficulty_score: generated.difficulty_score ?? 0.5,
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
