import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const HISTORY_TABLES = [
  "kp_evidence",
  "kp_records",
  "kp_diagnoses",
  "teaching_sessions",
  "kp_tests",
  "kp_tasks",
  "kp_moves",
  "ai_suggestions",
  "kp_notes",
  "ai_question_drafts",
];

function tableNotReady(error: { code?: string; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const sb = getSupabaseAdmin();
    // The legacy question FK cascades on knowledge-point deletion. A question
    // can also carry answer history and secondary concept links, so refuse the
    // delete before PostgreSQL can detach or cascade that data.
    const { data: questions, error: questionError } = await sb
      .from("questions")
      .select("id")
      .eq("knowledge_point_id", id)
      .limit(5000);
    if (questionError) {
      return NextResponse.json(
        { error: `无法确认该知识点是否关联正式题目，已阻止删除：${questionError.message}` },
        { status: 503 }
      );
    }
    const questionIds = (questions || []).map((question) => question.id);
    const [linkedQuestions, answerByKp, answerByQuestion] = await Promise.all([
      sb.from("question_concepts").select("question_id").eq("kp_id", id).limit(1),
      sb.from("answer_records").select("id").eq("kp_id", id).limit(1),
      questionIds.length
        ? sb.from("answer_records").select("id").in("question_id", questionIds).limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const relatedChecks = [linkedQuestions, answerByKp, answerByQuestion];
    const missingOptional = (error: { code?: string; message: string }) =>
      error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /schema cache|does not exist/i.test(error.message);
    const unsafeError = relatedChecks.find((result) => result.error && !missingOptional(result.error));
    if (unsafeError?.error) {
      return NextResponse.json(
        { error: `无法确认题目关联或答题历史是否安全，已阻止删除：${unsafeError.error.message}` },
        { status: 503 }
      );
    }
    if (questionIds.length || (linkedQuestions.data || []).length || (answerByKp.data || []).length || (answerByQuestion.data || []).length) {
      return NextResponse.json(
        {
          error: "该知识点关联正式题目、答题记录或题目标签。为避免级联删除题目或切断答题历史，系统已阻止删除；请先将知识点移动到其他章节。",
          code: "knowledge_point_has_questions_or_answers",
        },
        { status: 409 }
      );
    }
    const historyChecks = await Promise.all(
      HISTORY_TABLES.map((table) => sb.from(table).select("id").eq("kp_id", id).limit(1))
    );
    const checkError = historyChecks.find((result) => result.error && !tableNotReady(result.error));
    if (checkError?.error) {
      return NextResponse.json(
        { error: `无法确认历史记录是否安全，已阻止删除：${checkError.error.message}` },
        { status: 503 }
      );
    }
    if (historyChecks.some((result) => (result.data || []).length > 0)) {
      return NextResponse.json(
        {
          error: "该知识点仍有关联的学习记录、诊断证据、测试或笔记。为保护历史数据，系统已阻止删除；你可以调整知识点归属，关联历史会保留。",
          code: "knowledge_point_has_history",
        },
        { status: 409 }
      );
    }
    const { error } = await sb.from("knowledge_points").delete().eq("id", id);
    if (error?.code === "23503") {
      return NextResponse.json(
        {
          error: "该知识点仍有关联的学习记录、诊断证据、测试或笔记。为保护历史数据，请先保留或迁移这些记录，再删除知识点。",
          code: "knowledge_point_has_history",
        },
        { status: 409 }
      );
    }
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
