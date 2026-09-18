import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PaperRow {
  id: string;
  title: string;
  total_questions: number;
  knowledge_point_config: unknown;
  difficulty_level: string | null;
  paper_type: string;
  created_at: string;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const sb = getSupabaseAdmin();
    const { data: paper } = await sb
      .from("papers")
      .select("*")
      .eq("id", params.id)
      .single();
    if (!paper) return NextResponse.json({ error: "试卷不存在" }, { status: 404 });

    const { data: pq } = await sb
      .from("paper_questions")
      .select("question_id, questions(*)")
      .eq("paper_id", params.id)
      .order("sort_order");

    const questions = ((pq as unknown as Array<{ questions: Question | null }> | undefined) || [])
      .map((r) => r.questions)
      .filter(Boolean) as Question[];

    return NextResponse.json({ paper: paper as PaperRow, questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
