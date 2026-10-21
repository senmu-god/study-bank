import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PUT: 更新题目
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, question_text, options, correct_answer, explanation, difficulty } = body;
    if (!UUID.test(String(id || ""))) return NextResponse.json({ error: "题目 id 不合法" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (question_text !== undefined) patch.question_text = question_text;
    if (options !== undefined) patch.options = options;
    if (correct_answer !== undefined) patch.correct_answer = correct_answer;
    if (explanation !== undefined) patch.explanation = explanation;
    if (difficulty !== undefined) patch.difficulty = difficulty;

    const sb = getSupabaseAdmin();
    if (Object.prototype.hasOwnProperty.call(body, "primaryKpId") || Object.prototype.hasOwnProperty.call(body, "secondaryKpIds")) {
      const primaryKpId = body.primaryKpId === null || body.primaryKpId === "" ? null : String(body.primaryKpId || "");
      const secondaryKpIds = body.secondaryKpIds;
      if ((primaryKpId && !UUID.test(primaryKpId)) || !Array.isArray(secondaryKpIds) || secondaryKpIds.length > 50 || secondaryKpIds.some((kpId: unknown) => typeof kpId !== "string" || !UUID.test(kpId))) {
        return NextResponse.json({ error: "主知识点或次要知识点关联不合法" }, { status: 400 });
      }
      const { error } = await sb.rpc("kp_save_question_concepts", {
        p_question_id: id,
        p_patch: patch,
        p_primary_kp: primaryKpId,
        p_secondary_kps: [...new Set(secondaryKpIds)],
      });
      if (error) {
        const missing = error.code === "42883" || /function .*kp_save_question_concepts.* does not exist/i.test(error.message);
        if (missing) {
          const { error: questionError } = await sb.from("questions").update(patch).eq("id", id);
          if (questionError) return NextResponse.json({ error: questionError.message }, { status: 500 });
          return NextResponse.json({ ok: true, associationWarning: "题目内容已保存；知识点关联功能尚未启用，请按 README.md 应用对应迁移后再编辑关联。" });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    const { error } = await sb.from("questions").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
