import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET: 模考分析列表（按时间倒序）
export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("mock_exam_analyses")
      .select("*, papers(title, total_questions, created_at)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ analyses: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
