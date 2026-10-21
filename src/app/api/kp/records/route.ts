import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data: records, error } = await sb
    .from("kp_records")
    .select("id,kp_id,type,title,detail,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error.code === "42P01" || error.code === "PGRST205"
            ? "学习记录表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。"
            : error.message,
      },
      { status: error.code === "42P01" || error.code === "PGRST205" ? 503 : 500 }
    );
  }

  const kpIds = [...new Set((records || []).map((record) => record.kp_id))];
  const { data: concepts, error: conceptsError } = kpIds.length
    ? await sb.from("knowledge_points").select("id,content").in("id", kpIds)
    : { data: [], error: null };

  if (conceptsError) {
    return NextResponse.json({ ok: false, error: conceptsError.message }, { status: 500 });
  }

  const names = new Map((concepts || []).map((concept) => [concept.id, concept.content]));
  return NextResponse.json({
    ok: true,
    records: (records || []).map((record) => ({
      ...record,
      knowledge_point: names.get(record.kp_id) || "（知识点已删除）",
    })),
  });
}
