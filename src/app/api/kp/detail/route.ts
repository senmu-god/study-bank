import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { KpStatus } from "@/lib/kpStatus";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 单个知识点的预览数据。
 * 任何一张新表缺失都不影响整体返回，只是对应区块为空——
 * 这样在迁移执行前页面依然可用，不会白屏。
 */
export async function GET(req: Request) {
  const kpId = new URL(req.url).searchParams.get("kpId") || "";
  if (!UUID.test(kpId)) {
    return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: kp, error: kpErr } = await sb
    .from("knowledge_points")
    .select("id,content,section_id,difficulty")
    .eq("id", kpId)
    .maybeSingle();

  if (kpErr) return NextResponse.json({ ok: false, error: kpErr.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });

  const { data: section } = await sb
    .from("sections")
    .select("id,name,chapter_id")
    .eq("id", kp.section_id)
    .maybeSingle();

  const { data: chapter } = section
    ? await sb.from("chapters").select("id,name").eq("id", section.chapter_id).maybeSingle()
    : { data: null };

  const [stateRes, detailRes, qRes, qConceptRes, evRes, recRes, preRes, diagnosisRes] = await Promise.all([
    sb.from("kp_state").select("status,locked_by_user,last_studied_at").eq("kp_id", kpId).maybeSingle(),
    sb
      .from("kp_detail")
      .select("display_name,summary,formulas,conditions,error_patterns")
      .eq("kp_id", kpId)
      .maybeSingle(),
    sb
      .from("questions")
      .select("id,question_type,difficulty,question_text")
      .eq("knowledge_point_id", kpId)
      .limit(50),
    sb.from("question_concepts").select("question_id").eq("kp_id", kpId).limit(50),
    sb
      .from("kp_evidence")
      .select("id,question_id,answer_record_id,quote,error_type,reason,strength,source,created_at")
      .eq("kp_id", kpId)
      .order("created_at", { ascending: false })
      .limit(6),
    sb
      .from("kp_records")
      .select("id,type,title,detail,created_at")
      .eq("kp_id", kpId)
      .order("created_at", { ascending: false })
      .limit(8),
    sb.from("kp_edges").select("from_kp,type").eq("to_kp", kpId).limit(20),
    sb.from("kp_diagnoses").select("id,error_rate,sample_size,conclusion,confidence,suggested_status,created_at").eq("kp_id", kpId).order("created_at", { ascending: false }).limit(5),
  ]);

  const schemaReady = !stateRes.error;

  const primaryQuestions = qRes.error ? [] : (qRes.data || []);
  const primaryIds = new Set(primaryQuestions.map((question: any) => question.id));
  const extraQuestionIds = [...new Set((qConceptRes.data || []).map((link: any) => link.question_id).filter((id: string) => !primaryIds.has(id)))].slice(0, 50);
  const extraQuestions = extraQuestionIds.length
    ? await sb.from("questions").select("id,question_type,difficulty,question_text").in("id", extraQuestionIds)
    : { data: [] as any[] };

  // 前置知识点名称
  let prerequisites: { id: string; name: string; type: string }[] = [];
  if (preRes.data?.length) {
    const ids = preRes.data.map((e: any) => e.from_kp);
    const { data: names } = await sb.from("knowledge_points").select("id,content").in("id", ids);
    const nameMap = new Map((names || []).map((n: any) => [n.id, n.content]));
    prerequisites = preRes.data.map((e: any) => ({
      id: e.from_kp,
      name: nameMap.get(e.from_kp) || "（已删除）",
      type: e.type,
    }));
  }

  return NextResponse.json({
    ok: true,
    schemaReady,
    kp: {
      id: kp.id,
      content: kp.content,
      difficulty: kp.difficulty,
      section: section?.name || "",
      chapter: chapter?.name || "",
    },
    detail: detailRes.error ? null : detailRes.data,
    state: {
      status: ((stateRes.error ? null : stateRes.data?.status) || "new") as KpStatus,
      locked: Boolean(!stateRes.error && stateRes.data?.locked_by_user),
      lastStudiedAt: (!stateRes.error && stateRes.data?.last_studied_at) || null,
    },
    questions: [...primaryQuestions, ...(extraQuestions.data || [])].slice(0, 50),
    evidence: evRes.error ? [] : evRes.data || [],
    records: recRes.error ? [] : recRes.data || [],
    diagnoses: diagnosisRes.error ? [] : diagnosisRes.data || [],
    prerequisites,
  });
}
