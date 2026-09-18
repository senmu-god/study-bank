import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("papers")
      .select("id,title,total_questions,difficulty_level,paper_type,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ papers: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
