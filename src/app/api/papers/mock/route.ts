import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Question, QuestionType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 计算机基础 150 分模考结构 */
const COMPUTER150_TARGETS: Record<QuestionType, number> = {
  single_choice: 20,
  true_false: 15,
  multiple_choice: 10,
  fill_blank: 10,
  short_answer: 3,
  design: 2,
};
const COMPUTER150_POINTS: Record<QuestionType, number> = {
  single_choice: 2,
  true_false: 1,
  multiple_choice: 3,
  fill_blank: 3,
  short_answer: 5,
  design: 10,
};

interface QRow extends Question {
  knowledge_points: { id: string; content: string; sections: { chapters: { subjects: { name: string } | null } | null } | null } | null;
}

/**
 * POST /api/papers/mock
 * body: { variant?: "computer150", totalQuestions?: number }
 * - computer150: 按计算机基础 150 分固定结构选题并赋分
 * - 其他: 旧行为，自动覆盖知识点随机抽 N 题
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const variant = body.variant || "";
    const sb = getSupabaseAdmin();

    const { data: qRows, error: qErr } = await sb
      .from("questions")
      .select("*, knowledge_points(id, content, sections(chapters(subjects(name))))");
    if (qErr) throw qErr;
    const allQ = (qRows || []) as unknown as QRow[];
    if (allQ.length === 0) {
      return NextResponse.json({ error: "题库为空，请先生成题目" }, { status: 400 });
    }

    let picked: { q: Question; points: number }[] = [];
    let title = `模考试卷 ${new Date().toLocaleString("zh-CN")}`;
    const gaps: string[] = [];

    if (variant === "computer150") {
      // 只从计算机科目的题里抽
      const pool = allQ.filter((q) =>
        /计算机|电脑|办公|office|网络|程序|数据库/i.test(
          q.knowledge_points?.sections?.chapters?.subjects?.name || ""
        )
      );
      if (pool.length === 0) {
        return NextResponse.json({ error: "没有计算机科目的题目，请先生成计算机知识点的题" }, { status: 400 });
      }

      const byType = (t: QuestionType) =>
        pool
          .filter((q) => q.question_type === t)
          .sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));

      const usedIds = new Set<string>();
      const types: QuestionType[] = [
        "single_choice",
        "true_false",
        "multiple_choice",
        "fill_blank",
        "short_answer",
        "design",
      ];
      for (const t of types) {
        const want = COMPUTER150_TARGETS[t];
        let candidates = byType(t).filter((q) => !usedIds.has(q.id));
        // design 题不足时，用 short_answer 顶替
        if (t === "design" && candidates.length < want) {
          const sa = byType("short_answer").filter((q) => !usedIds.has(q.id));
          candidates = [...candidates, ...sa];
        }
        for (let i = 0; i < want; i++) {
          if (!candidates[i]) { gaps.push(`${t} 缺题`); continue; }
          picked.push({ q: candidates[i], points: COMPUTER150_POINTS[t] });
          usedIds.add(candidates[i].id);
        }
      }
      title = `计算机基础模考（150分） ${new Date().toLocaleString("zh-CN")}`;
    } else {
      const totalQuestions = Number(body.totalQuestions) || 24;
      if (allQ.length < totalQuestions) {
        return NextResponse.json({ error: `题库只有 ${allQ.length} 题，不足 ${totalQuestions} 题` }, { status: 400 });
      }
      // 旧行为：每知识点抽1题，按 usage_count 最少优先
      const byKp = new Map<string, QRow[]>();
      for (const q of allQ) {
        const k = q.knowledge_points?.id || "unknown";
        (byKp.get(k) || byKp.set(k, []).get(k)!).push(q);
      }
      const usedIds = new Set<string>();
      for (const arr of byKp.values()) {
        if (picked.length >= totalQuestions) break;
        arr.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
        picked.push({ q: arr[0], points: 1 });
        usedIds.add(arr[0].id);
      }
      if (picked.length < totalQuestions) {
        const rest = allQ.filter((q) => !usedIds.has(q.id)).sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0));
        for (const q of rest) {
          if (picked.length >= totalQuestions) break;
          picked.push({ q, points: 1 });
          usedIds.add(q.id);
        }
      }
    }

    if (picked.length === 0) {
      return NextResponse.json({ error: "没有可用题目" }, { status: 400 });
    }

    const fullScore = picked.reduce((s, p) => s + p.points, 0);

    const { data: paper, error: pErr } = await sb
      .from("papers")
      .insert({
        title,
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
      .insert(picked.map((p, idx) => ({ paper_id: paper.id, question_id: p.q.id, sort_order: idx, points: p.points })));

    for (const p of picked) {
      await sb
        .from("questions")
        .update({ usage_count: (p.q.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", p.q.id);
    }

    return NextResponse.json({ paperId: paper.id, count: picked.length, fullScore, gaps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成模考试卷失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
