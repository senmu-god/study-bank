import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// GET: 题库列表（分页 + 按知识点/题型筛选）
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kpId = searchParams.get("kp_id");
    const qType = searchParams.get("question_type");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = 50;

    const sb = getSupabaseAdmin();
    let query = sb
      .from("questions")
      .select("*, knowledge_points(content, sections(name, chapters(name, subjects(name))))", { count: "exact" })
      .order("generated_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (kpId) query = query.eq("knowledge_point_id", kpId);
    if (qType) query = query.eq("question_type", qType);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
