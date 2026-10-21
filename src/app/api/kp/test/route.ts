import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const schemaMissing = (error: { code?: string; message: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);

/**
 * 为单个知识点组一份专项测试卷。
 *
 * 不新造答题链路：卷子直接落到 papers / paper_questions，
 * 作答与判分完全复用现有 /exam/[paperId] 与 /api/exam/submit，
 * 这样答题记录、错题本、判分口径都和普通考试一致。
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const kpId = String(body?.kpId || "");
  const want = Math.max(1, Math.min(20, Number(body?.count) || 5));
  const kind = body?.kind === "retest" ? "retest" : "initial";

  if (!UUID.test(kpId)) {
    return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: kp, error: kpErr } = await sb
    .from("knowledge_points")
    .select("id,content")
    .eq("id", kpId)
    .maybeSingle();

  if (kpErr) return NextResponse.json({ ok: false, error: kpErr.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });

  // 优先取本知识点的主关联题目；不足时再取 question_concepts 里的次要关联
  const poolLimit = Math.min(500, Math.max(want * 10, 50));
  const { data: primary, error: primaryError } = await sb
    .from("questions")
    .select("id,difficulty,difficulty_score,usage_count")
    .eq("knowledge_point_id", kpId)
    .limit(poolLimit);
  if (primaryError) return NextResponse.json({ ok: false, error: `读取专项测试题目失败：${primaryError.message}` }, { status: 500 });

  const poolById = new Map((primary || []).map((question: any) => [question.id, question]));

  {
    const { data: links, error: linksError } = await sb
      .from("question_concepts")
      .select("question_id")
      .eq("kp_id", kpId)
      .limit(poolLimit);
    if (linksError && !schemaMissing(linksError)) return NextResponse.json({ ok: false, error: `读取次要知识点题目关联失败：${linksError.message}` }, { status: 500 });

    const extraIds = (links || []).map((link: any) => link.question_id).filter((id: string) => !poolById.has(id));

    if (extraIds.length) {
      const { data: extra, error: extraError } = await sb
        .from("questions")
        .select("id,difficulty,difficulty_score,usage_count")
        .in("id", extraIds)
        .limit(poolLimit);
      if (extraError) return NextResponse.json({ ok: false, error: `读取次要关联题目失败：${extraError.message}` }, { status: 500 });
      for (const question of extra || []) poolById.set(question.id, question);
    }
  }

  let pool = [...poolById.values()];

  if (pool.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        noQuestions: true,
        error: "该知识点暂无题目，无法组卷。可先生成补充题。",
      },
      { status: 409 }
    );
  }

  const { data: history, error: historyError } = await sb.from("kp_tests")
    .select("detail,score,passed,kind,created_at")
    .eq("kp_id", kpId)
    .order("created_at", { ascending: false })
    .limit(3);
  if (historyError) return NextResponse.json({ ok: false, error: `读取历史专项测试失败：${historyError.message}` }, { status: 500 });
  const recentlyUsed = new Set((history || []).flatMap((test: any) => Array.isArray(test.detail?.questionIds) ? test.detail.questionIds : []));
  const freshPool = pool.filter((question: any) => !recentlyUsed.has(question.id));
  if (freshPool.length >= Math.min(want, pool.length)) pool = freshPool;

  // Prefer a mix of medium and harder questions; use lower levels only when needed.
  const order: Record<string, number> = kind === "retest"
    ? { hard: 0, medium: 1, medium_easy: 2, easy: 3 }
    : { medium: 0, medium_easy: 1, hard: 2, easy: 3 };
  pool.sort((a: any, b: any) => (order[a.difficulty] ?? 2) - (order[b.difficulty] ?? 2) || Number(a.usage_count || 0) - Number(b.usage_count || 0));
  const picked = pool.slice(0, want);

  const title = `${kind === "retest" ? "复测" : "专项测试"} · ${kp.content}`;
  const { data: paper, error: pErr } = await sb
    .from("papers")
    .insert({
      title,
      total_questions: picked.length,
      knowledge_point_config: { kpId, kind, source: "kp_test" },
      difficulty_level: "mixed",
      paper_type: "kp_test",
    })
    .select("id")
    .single();

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

  const rows = picked.map((q: any, i: number) => ({
    paper_id: paper.id,
    question_id: q.id,
    sort_order: i,
    points: 1,
  }));
  const { error: pqErr } = await sb.from("paper_questions").insert(rows);
  if (pqErr) {
    // 组卷失败要把空卷删掉，避免留下无题试卷
    await sb.from("papers").delete().eq("id", paper.id);
    return NextResponse.json({ ok: false, error: pqErr.message }, { status: 500 });
  }

  const { data: testRow, error: testErr } = await sb
    .from("kp_tests")
    .insert({ kp_id: kpId, paper_id: paper.id, kind })
    .select("id")
    .single();

  if (testErr) {
    await sb.from("paper_questions").delete().eq("paper_id", paper.id);
    await sb.from("papers").delete().eq("id", paper.id);
    return NextResponse.json({ ok: false, error: `测试记录创建失败，已撤销空试卷：${testErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    paperId: paper.id,
    testId: testRow?.id ?? null,
    count: picked.length,
    shortfall: want - picked.length,
    href: `/exam/${paper.id}`,
    kp: { id: kp.id, content: kp.content },
  });
}
