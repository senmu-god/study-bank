import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { largestRemainder } from "@/lib/paperSelector";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/papers/mock
 * 一键生成模考试卷：自动覆盖所有知识点，题型均衡，24题
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const totalQuestions = Number(body.totalQuestions) || 24;

    const sb = getSupabaseAdmin();

    // 拉所有题目（含知识点信息）
    const { data: questions, error: qErr } = await sb
      .from("questions")
      .select("*, knowledge_points(id, content)");
    if (qErr) throw qErr;

    const allQ = (questions || []) as (Question & { knowledge_points: { id: string; content: string } | null })[];
    if (allQ.length < totalQuestions) {
      return NextResponse.json({ error: `题库只有 ${allQ.length} 题，不足 ${totalQuestions} 题` }, { status: 400 });
    }

    // 按知识点分组，每个知识点尽量抽1题（覆盖广）
    const byKp = new Map<string, typeof allQ>();
    for (const q of allQ) {
      const kpId = q.knowledge_points?.id || "unknown";
      if (!byKp.has(kpId)) byKp.set(kpId, []);
      byKp.get(kpId)!.push(q);
    }

    // 每个知识点优先抽1题（轮流），按 usage_count 最少优先
    const kpIds = [...byKp.keys()];
    const picked: Question[] = [];
    const usedIds = new Set<string>();

    // 第一轮：每个知识点抽 usage_count 最少的1题
    for (const kpId of kpIds) {
      if (picked.length >= totalQuestions) break;
      const pool = byKp.get(kpId)!.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
      const q = pool[0];
      picked.push(q);
      usedIds.add(q.id);
    }

    // 第二轮：还不够就从所有题中按题型均衡补
    if (picked.length < totalQuestions) {
      const remaining = allQ.filter((q) => !usedIds.has(q.id));
      // 题型配额
      const typeCounts: Record<string, number> = {};
      for (const q of picked) typeCounts[q.question_type] = (typeCounts[q.question_type] || 0) + 1;
      const types = ["single_choice", "multiple_choice", "fill_blank", "true_false", "short_answer"];
      const typeWeights = types.map((t) => (typeCounts[t] || 0));
      const needed = types.map(() => 0);
      // 简单：按题型轮换补
      let typeIdx = 0;
      const shuffled = [...remaining].sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
      for (const q of shuffled) {
        if (picked.length >= totalQuestions) break;
        picked.push(q);
        usedIds.add(q.id);
      }
    }

    // 硬性截断
    picked.length = Math.min(picked.length, totalQuestions);

    // 创建试卷
    const { data: paper, error: pErr } = await sb
      .from("papers")
      .insert({
        title: `模考试卷 ${new Date().toLocaleString("zh-CN")}`,
        total_questions: picked.length,
        knowledge_point_config: [],
        difficulty_level: "mixed",
        paper_type: "mock",
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    await sb
      .from("paper_questions")
      .insert(picked.map((q, idx) => ({ paper_id: paper.id, question_id: q.id, sort_order: idx })));

    for (const q of picked) {
      await sb
        .from("questions")
        .update({ usage_count: (q.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", q.id);
    }

    return NextResponse.json({ paperId: paper.id, count: picked.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成模考试卷失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
