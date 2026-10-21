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
      .select("*, knowledge_points!questions_knowledge_point_id_fkey(content, sections(name, chapters(name, subjects(name))))", { count: "exact" })
      .order("generated_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (kpId) query = query.eq("knowledge_point_id", kpId);
    if (qType) query = query.eq("question_type", qType);

    const { data, count, error } = await query;
    if (error) throw error;

    const questionIds = (data || []).map((item) => item.id);
    const links = questionIds.length
      ? await sb.from("question_concepts").select("question_id,kp_id").in("question_id", questionIds)
      : { data: [], error: null };
    const linkMap = new Map<string, string[]>();
    if (!links.error) for (const link of links.data || []) {
      const values = linkMap.get(link.question_id) || [];
      values.push(link.kp_id);
      linkMap.set(link.question_id, values);
    }
    const items = (data || []).map((item) => ({
      ...item,
      conceptIds: [...new Set([...(item.knowledge_point_id ? [item.knowledge_point_id] : []), ...(linkMap.get(item.id) || [])])],
    }));

    return NextResponse.json({
      items,
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
