import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 答题视图：不返回正确答案与解析，防止前端泄题。
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sb = getSupabaseAdmin();
    const { data: paper } = await sb
      .from("papers")
      .select("id,title,total_questions,created_at")
      .eq("id", params.id)
      .single();
    if (!paper) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });

    const { data: pq } = await sb
      .from("paper_questions")
      .select("question_id, questions(id,knowledge_point_id,question_type,question_text,options,difficulty_score)")
      .eq("paper_id", params.id)
      .order("sort_order");

    const questions = ((pq as unknown as Array<{ questions: Question }> | undefined) || []).map(
      (row) => row.questions
    );

    return NextResponse.json({ paper, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
