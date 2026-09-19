import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * POST /api/questions/clear
 * 清空题库。后端仅接受 POST，且需 body.confirm === "确认清空"。
 * 先删答题记录（无级联外键），再删 questions（级联清理 paper_questions / wrong_answers）。
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "确认清空") {
      return NextResponse.json({ error: "二次校验未通过" }, { status: 400 });
    }
    const sb = getSupabaseAdmin();

    const { error: arErr } = await sb.from("answer_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (arErr) throw arErr;

    const { error: qErr, count } = await sb
      .from("questions")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (qErr) throw qErr;

    return NextResponse.json({ cleared: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "清空失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
