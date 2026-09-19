import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/questions/delete
 * body: { questionIds: string[] }
 * 批量删除题目。先清理引用该题的 answer_records（该外键无 ON DELETE CASCADE），
 * paper_questions / wrong_answers 已是级联删除。
 */
export async function POST(req: Request) {
  try {
    const { questionIds } = await req.json();
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: "请选择要删除的题目" }, { status: 400 });
    }
    const sb = getSupabaseAdmin();

    // 1. 删除答题记录引用（无级联）
    const { error: arErr } = await sb.from("answer_records").delete().in("question_id", questionIds);
    if (arErr) throw arErr;

    // 2. paper_questions / wrong_answers 为 ON DELETE CASCADE，删 questions 自动级联
    const { error: qErr, count } = await sb
      .from("questions")
      .delete({ count: "exact" })
      .in("id", questionIds);
    if (qErr) throw qErr;

    return NextResponse.json({ deleted: count ?? questionIds.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
