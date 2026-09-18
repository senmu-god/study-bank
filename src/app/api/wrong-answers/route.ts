import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("wrong_answers")
      .select(
        "id,question_id,wrong_count,last_wrong_at,mastered,next_review_at,ease_factor, questions(*, knowledge_points(content, sections(name, chapters(name, subjects(name))))))"
      )
      .order("wrong_count", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ items: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, mastered } = body as { id: string; mastered: boolean };
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("wrong_answers").update({ mastered }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
