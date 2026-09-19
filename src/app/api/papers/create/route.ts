import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { selectQuestionsForPaper, type KpSelection, type TypeRatio } from "@/lib/paperSelector";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST 组卷
 * {
 *   title, totalQuestions, kpConfig: [{kpId, percentage}],
 *   typeRatios: {single_choice,...}, difficultyRange, paperType,
 *   fromWrong?: boolean
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      totalQuestions = 24,
      kpConfig = [],
      typeRatios,
      difficultyRange = "mixed",
      paperType = "daily",
      fromWrong = false,
    } = body as {
      title: string;
      totalQuestions: number;
      kpConfig: KpSelection[];
      typeRatios: TypeRatio;
      difficultyRange: "easy" | "medium_easy" | "medium" | "hard" | "mixed";
      paperType: string;
      fromWrong?: boolean;
    };

    const sb = getSupabaseAdmin();

    let selected: Question[] = [];

    if (fromWrong) {
      // 复习卷：从未掌握且到了复习时间的错题里抽题
      const { data: wrongRows } = await sb
        .from("wrong_answers")
        .select("question_id, questions(*)")
        .eq("mastered", false)
        .order("next_review_at", { ascending: true });

      const typedRows = (wrongRows as unknown as Array<{ questions: Question; next_review_at: string | null }> | undefined) || [];
      const now = new Date().toISOString();
      const due = typedRows.filter((w) => {
        if (!w.questions) return false;
        return !w.next_review_at || w.next_review_at <= now;
      });
      selected = due.slice(0, totalQuestions).map((w) => w.questions);
    } else {
      if (!Array.isArray(kpConfig) || kpConfig.length === 0) {
        return NextResponse.json({ error: "未选择知识点" }, { status: 400 });
      }
      const kpIds = kpConfig.map((k) => k.kpId);
      const { data: questions } = await sb
        .from("questions")
        .select("*")
        .in("knowledge_point_id", kpIds);

      const questionsByKp: Record<string, Question[]> = {};
      for (const q of (questions || []) as Question[]) {
        questionsByKp[q.knowledge_point_id] ??= [];
        questionsByKp[q.knowledge_point_id].push(q);
      }

      const result = selectQuestionsForPaper({
        totalQuestions,
        kpConfig,
        typeRatios,
        difficultyRange,
        questionsByKp,
      });
      selected = result.selected;
    }

    if (selected.length === 0) {
      return NextResponse.json({ error: "题库中没有可用题目，请先生成题目" }, { status: 400 });
    }

    // 创建考卷
    const { data: paper, error: paperErr } = await sb
      .from("papers")
      .insert({
        title: title || `试卷 ${new Date().toLocaleString("zh-CN")}`,
        total_questions: selected.length,
        knowledge_point_config: kpConfig,
        difficulty_level: difficultyRange,
        paper_type: paperType,
      })
      .select("id")
      .single();
    if (paperErr) throw paperErr;

    // 关联题目
    await sb
      .from("paper_questions")
      .insert(selected.map((q, idx) => ({ paper_id: paper.id, question_id: q.id, sort_order: idx })));

    // 更新使用次数
    for (const q of selected) {
      await sb
        .from("questions")
        .update({ usage_count: (q.usage_count || 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", q.id);
    }

    return NextResponse.json({ paperId: paper.id, count: selected.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "组卷失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
