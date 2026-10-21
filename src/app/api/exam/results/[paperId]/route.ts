import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { paperId: string } }
) {
  try {
    const sb = getSupabaseAdmin();
    const { data: records } = await sb
      .from("answer_records")
      .select("*")
      .eq("paper_id", params.paperId);
    if (!records || records.length === 0) {
      return NextResponse.json({ error: "未找到答卷" }, { status: 404 });
    }

    const qIds = records.map((r: { question_id: string }) => r.question_id);
    const { data: questions } = await sb.from("questions").select("*").in("id", qIds);
    const qMap = new Map((questions || []).map((q: Question) => [q.id, q]));

    const kpIds = [...new Set((questions || []).map((q: Question) => q.knowledge_point_id))];
    const { data: kpData } = await sb.from("knowledge_points").select("id,content").in("id", kpIds);
    const kpMap = new Map((kpData || []).map((k) => [k.id, k.content]));

    const results = records.map((r: {
      question_id: string;
      user_answer: string | null;
      is_correct: boolean;
      time_spent_seconds: number;
      ai_score_percent?: number | null;
      ai_comment?: string | null;
    }) => ({
      question: qMap.get(r.question_id),
      userAnswer: r.user_answer,
      isCorrect: r.is_correct,
      timeSpentSeconds: r.time_spent_seconds || 0,
      aiScorePercent: r.ai_score_percent ?? null,
      aiComment: r.ai_comment ?? null,
    }));

    const total = results.length;
    const correct = results.filter((r: { isCorrect: boolean }) => r.isCorrect).length;

    const kpStatMap = new Map<string, { kpId: string; content: string; total: number; correct: number }>();
    for (const r of results) {
      if (!r.question) continue;
      const kpId = r.question.knowledge_point_id;
      const stat = kpStatMap.get(kpId) || { kpId, content: kpMap.get(kpId) || "", total: 0, correct: 0 };
      stat.total++;
      if (r.isCorrect) stat.correct++;
      kpStatMap.set(kpId, stat);
    }

    const { data: testRow } = await sb
      .from("kp_tests")
      .select("id,kp_id,kind,score,passed,conclusion")
      .eq("paper_id", params.paperId)
      .maybeSingle();
    let kpTest = null;
    if (testRow) {
      const [{ data: state }, { data: targetKp }] = await Promise.all([
        sb.from("kp_state").select("status,locked_by_user").eq("kp_id", testRow.kp_id).maybeSingle(),
        sb.from("knowledge_points").select("content").eq("id", testRow.kp_id).maybeSingle(),
      ]);
      kpTest = {
        kpId: testRow.kp_id,
        kpName: targetKp?.content || "知识点",
        kind: testRow.kind,
        score: testRow.score,
        passed: testRow.passed,
        conclusion: testRow.conclusion,
        status: state?.status || "new",
        locked: Boolean(state?.locked_by_user),
      };
    }

    return NextResponse.json({
      summary: { total, correct, accuracy: total ? Math.round((correct / total) * 100) : 0 },
      results,
      kpStats: [...kpStatMap.values()],
      kpTest,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
