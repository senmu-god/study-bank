import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// DELETE: 删除试卷（级联删除 paper_questions、answer_records）
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("papers").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
