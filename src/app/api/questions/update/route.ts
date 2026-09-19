import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// PUT: 更新题目
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, question_text, options, correct_answer, explanation, difficulty } = body;
    if (!id) return NextResponse.json({ error: "缺少题目 id" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (question_text !== undefined) patch.question_text = question_text;
    if (options !== undefined) patch.options = options;
    if (correct_answer !== undefined) patch.correct_answer = correct_answer;
    if (explanation !== undefined) patch.explanation = explanation;
    if (difficulty !== undefined) patch.difficulty = difficulty;

    const sb = getSupabaseAdmin();
    const { error } = await sb.from("questions").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
