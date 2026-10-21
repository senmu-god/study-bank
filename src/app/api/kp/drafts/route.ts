import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { generateOneQuestion } from "@/lib/deepseek";
import type { Difficulty, QuestionType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_TYPES: QuestionType[] = ["single_choice", "multiple_choice", "fill_blank", "true_false", "short_answer", "design"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium_easy", "medium", "hard"];
const unavailable = (error: { code?: string; message: string }) => error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);

function qualityChecks(question: any, type: QuestionType) {
  const text = typeof question.question_text === "string" ? question.question_text.trim() : "";
  const answer = typeof question.correct_answer === "string" ? question.correct_answer.trim() : "";
  const explanation = typeof question.explanation === "string" ? question.explanation.trim() : "";
  let structure = Boolean(text && text.length <= 10000);
  let answerValid = Boolean(answer && answer.length <= 5000);
  const options = Array.isArray(question.options) ? question.options : [];
  if (type === "single_choice" || type === "multiple_choice") {
    const labels = options.map((o: any) => String(o?.label || "").trim().toUpperCase());
    const uniqueLabels = new Set(labels);
    structure &&= options.length === 4 && labels.every((label: string) => ["A", "B", "C", "D"].includes(label)) && uniqueLabels.size === 4 && options.every((o: any) => String(o?.text || "").trim());
    const answers = [...new Set(answer.toUpperCase().replace(/[^A-D]/g, "").split(""))];
    answerValid &&= answers.length > 0 && answers.every((label) => labels.includes(label)) && (type === "single_choice" ? answers.length === 1 : answers.length >= 2);
  } else if (type === "true_false") {
    structure &&= options.length === 0;
    answerValid &&= answer === "对" || answer === "错";
  } else {
    structure &&= options.length === 0;
  }
  return {
    structure,
    answer: answerValid,
    explanation: Boolean(explanation && explanation.length <= 20000),
    noStaleReferences: !/Windows ?7|Windows ?XP|Office ?2003|Office ?2007|2010年以前|诺基亚|摩托罗拉|小灵通/i.test(`${text} ${explanation}`),
    requiresHumanReview: true,
  };
}

export async function GET(req: Request) {
  const kpId = new URL(req.url).searchParams.get("kpId") || "";
  if (!UUID.test(kpId)) return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("ai_question_drafts")
    .select("id,kp_id,question_type,payload,checks,state,question_id,model,created_at")
    .eq("kp_id", kpId).order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ ok: false, error: unavailable(error) ? "AI 候选题表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" : error.message }, { status: unavailable(error) ? 503 : 500 });
  return NextResponse.json({ ok: true, drafts: data || [] });
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }
  const kpId = String(body?.kpId || "");
  const type = body?.questionType as QuestionType;
  const difficulty = (DIFFICULTIES.includes(body?.difficulty) ? body.difficulty : "medium") as Difficulty;
  if (!UUID.test(kpId)) return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  if (body?.consent !== true) return NextResponse.json({ ok: false, error: "生成题目会将知识点名称和章节信息发送给已配置的 AI 服务；请先确认。" }, { status: 400 });
  if (!QUESTION_TYPES.includes(type)) return NextResponse.json({ ok: false, error: "题型不合法" }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: kp, error: kpError } = await sb.from("knowledge_points").select("id,content,section_id").eq("id", kpId).maybeSingle();
  if (kpError) return NextResponse.json({ ok: false, error: kpError.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });
  const { data: section, error: sectionError } = await sb.from("sections").select("name,chapter_id").eq("id", kp.section_id).maybeSingle();
  if (sectionError) return NextResponse.json({ ok: false, error: sectionError.message }, { status: 500 });
  const { data: chapter, error: chapterError } = section ? await sb.from("chapters").select("name,subject_id").eq("id", section.chapter_id).maybeSingle() : { data: null, error: null };
  if (chapterError) return NextResponse.json({ ok: false, error: chapterError.message }, { status: 500 });
  const { data: subject, error: subjectError } = chapter?.subject_id ? await sb.from("subjects").select("name").eq("id", chapter.subject_id).maybeSingle() : { data: null, error: null };
  if (subjectError) return NextResponse.json({ ok: false, error: subjectError.message }, { status: 500 });
  const { data: existing } = await sb.from("questions").select("question_text").eq("knowledge_point_id", kpId).order("generated_at", { ascending: false }).limit(50);
  const existingSummary = (existing || []).map((q: any, i: number) => `${i + 1}. ${q.question_text.slice(0, 100)}`).join("；");
  try {
    const generated = await generateOneQuestion({ subject: subject?.name || "高等数学", chapter: chapter?.name || "", section: section?.name || "", kpContent: kp.content, questionType: type, difficulty, existingSummary });
    const checks = qualityChecks(generated, type);
    if (!checks.structure || !checks.answer || !checks.explanation || !checks.noStaleReferences) {
      return NextResponse.json({ ok: false, error: "生成题未通过结构、答案或时效检查，未保存到题库。请重试。", checks }, { status: 422 });
    }
    const payload = { ...generated, question_type: type };
    const { data: draft, error } = await sb.from("ai_question_drafts").insert({ kp_id: kpId, question_type: type, payload, checks, state: "draft", model: process.env.DEEPSEEK_MODEL || "deepseek-chat" }).select("id,kp_id,question_type,payload,checks,state,created_at").single();
    if (error) return NextResponse.json({ ok: false, error: unavailable(error) ? "候选题表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" : error.message }, { status: unavailable(error) ? 503 : 500 });
    return NextResponse.json({ ok: true, draft }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "生成失败" }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }
  const draftId = String(body?.draftId || "");
  if (!UUID.test(draftId)) return NextResponse.json({ ok: false, error: "候选题 id 不合法" }, { status: 400 });
  const sb = getSupabaseAdmin();
  if (body?.action === "reject") {
    const { data, error } = await sb.from("ai_question_drafts").update({ state: "rejected" }).eq("id", draftId).eq("state", "draft").select("id,state").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "候选题不存在或已处理" }, { status: 409 });
    return NextResponse.json({ ok: true, draft: data });
  }
  if (body?.action !== "publish" || body?.confirm !== true) return NextResponse.json({ ok: false, error: "请明确确认写入正式题库" }, { status: 400 });
  const { data, error } = await sb.rpc("kp_publish_question_draft", { p_draft_id: draftId });
  if (error) {
    const missing = error.code === "42883" || /function .*kp_publish_question_draft.* does not exist/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "安全写入功能不可用，请确认已按 README.md 应用对应迁移。" : error.message }, { status: missing ? 503 : 409 });
  }
  return NextResponse.json({ ok: true, questionId: data });
}
