import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { chatJSON, MODEL } from "@/lib/deepseek";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM = `你是一位耐心的高等数学互动老师。请围绕给定知识点进行分步骤教学：每次只推进一个小步骤，并用一个具体问题检查理解；根据学生实际回答继续，不得虚构学生的推理过程。hint 动作只给分级提示，不直接泄露完整答案；solution 动作才展示完整讲解。教学结束只表示本轮教学结束，绝不等同于学生已掌握。
只输出 JSON：{"message":"给学生看的内容","done":false}。message 必须是有帮助的中文文本，done 仅在本轮学习对话自然结束时为 true。`;

type TeachAction = "start" | "reply" | "hint" | "solution";
interface TeachResponse {
  message?: string;
  done?: boolean;
}

function schemaError(error: { code?: string; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

function unavailable(message = "互动教学数据表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。") {
  return NextResponse.json({ ok: false, error: message }, { status: 503 });
}

export async function GET(req: Request) {
  const kpId = new URL(req.url).searchParams.get("kpId") || "";
  if (!UUID.test(kpId)) return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: session, error } = await sb
    .from("teaching_sessions")
    .select("id,kp_id,status,step,hint_level,created_at,updated_at")
    .eq("kp_id", kpId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return schemaError(error) ? unavailable() : NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!session) return NextResponse.json({ ok: true, session: null, messages: [] });

  const { data: messages, error: messageError } = await sb
    .from("teaching_messages")
    .select("id,role,content,hint_level,created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  if (messageError) {
    return schemaError(messageError)
      ? unavailable()
      : NextResponse.json({ ok: false, error: messageError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, session, messages: messages || [] });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const kpId = String(body?.kpId || "");
  const action = body?.action as TeachAction;
  const sessionId = String(body?.sessionId || "");
  const reply = typeof body?.message === "string" ? body.message.trim().slice(0, 3000) : "";
  if (!UUID.test(kpId)) return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  if (!["start", "reply", "hint", "solution"].includes(action)) {
    return NextResponse.json({ ok: false, error: "教学操作不合法" }, { status: 400 });
  }
  if (action !== "start" && !UUID.test(sessionId)) {
    return NextResponse.json({ ok: false, error: "sessionId 不合法" }, { status: 400 });
  }
  if (action === "reply" && !reply) {
    return NextResponse.json({ ok: false, error: "请先输入你的想法或答案" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: kp, error: kpError } = await sb
    .from("knowledge_points")
    .select("id,content,section_id")
    .eq("id", kpId)
    .maybeSingle();
  if (kpError) return NextResponse.json({ ok: false, error: kpError.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });

  const { data: detail, error: detailError } = await sb
    .from("kp_detail")
    .select("summary,formulas,conditions,error_patterns")
    .eq("kp_id", kpId)
    .maybeSingle();
  if (detailError && !schemaError(detailError)) {
    return NextResponse.json({ ok: false, error: detailError.message }, { status: 500 });
  }

  let session: any = null;
  let history: { role: "assistant" | "user"; content: string }[] = [];
  if (action === "start") {
    const { data: active, error: activeError } = await sb
      .from("teaching_sessions")
      .select("id,kp_id,status,step,hint_level")
      .eq("kp_id", kpId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeError) return schemaError(activeError) ? unavailable() : NextResponse.json({ ok: false, error: activeError.message }, { status: 500 });
    session = active;
  } else {
    const { data: found, error: sessionError } = await sb
      .from("teaching_sessions")
      .select("id,kp_id,status,step,hint_level")
      .eq("id", sessionId)
      .eq("kp_id", kpId)
      .maybeSingle();
    if (sessionError) return schemaError(sessionError) ? unavailable() : NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
    if (!found || found.status !== "active") {
      return NextResponse.json({ ok: false, error: "教学会话已结束，请重新开始学习。" }, { status: 409 });
    }
    session = found;
    const { data: messages, error: messagesError } = await sb
      .from("teaching_messages")
      .select("role,content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (messagesError) return schemaError(messagesError) ? unavailable() : NextResponse.json({ ok: false, error: messagesError.message }, { status: 500 });
    history = (messages || []).reverse().map((message: any) => ({ role: message.role, content: message.content }));
  }

  const actionInstruction: Record<TeachAction, string> = {
    start: "开始教学：简短说明本知识点的一条核心直觉，然后提出一个很小的检查问题。不要一次性讲完。",
    reply: "学生刚刚回答了问题。先回应其答案中正确或需要澄清的部分，再只推进一个教学步骤并提出下一问。",
    hint: "学生请求提示。给出比上一条更具体一级的提示，但不要直接给出完整答案。",
    solution: "学生请求查看完整解答。给出清晰、分步的完整讲解，指出关键条件和常见错误，最后问学生是否需要针对某一步继续练习。",
  };
  const context = [
    `知识点：${kp.content}`,
    detail?.summary ? `摘要：${detail.summary}` : "",
    Array.isArray(detail?.formulas) && detail.formulas.length ? `公式：${JSON.stringify(detail.formulas).slice(0, 2000)}` : "",
    Array.isArray(detail?.conditions) && detail.conditions.length ? `适用条件：${detail.conditions.join("；")}` : "",
    Array.isArray(detail?.error_patterns) && detail.error_patterns.length ? `常见错误：${detail.error_patterns.join("；")}` : "",
    `当前操作：${actionInstruction[action]}`,
    history.length ? `最近对话：\n${history.map((m) => `${m.role === "user" ? "学生" : "老师"}：${m.content}`).join("\n")}` : "",
    action === "reply" ? `学生本次回答：${reply}` : "",
    action === "hint" ? `当前提示层级：${Number(session?.hint_level || 0) + 1}（最多3级）` : "",
  ].filter(Boolean).join("\n\n");

  const ai = await chatJSON<TeachResponse>(SYSTEM, context, { temperature: 0.45, maxTokens: 1000 });
  if (!ai.ok) return NextResponse.json({ ok: false, error: `教学请求失败：${ai.error}` }, { status: 502 });
  const assistantText = typeof ai.data.message === "string" ? ai.data.message.trim().slice(0, 6000) : "";
  if (!assistantText) return NextResponse.json({ ok: false, error: "AI 未返回有效教学内容，请重试。" }, { status: 502 });

  if (!session) {
    const { data: created, error: createError } = await sb
      .from("teaching_sessions")
      .insert({ kp_id: kpId, status: "active" })
      .select("id,kp_id,status,step,hint_level")
      .single();
    if (createError) return schemaError(createError) ? unavailable() : NextResponse.json({ ok: false, error: createError.message }, { status: 500 });
    session = created;
  }

  const messageRows = [
    ...(action === "reply" ? [{ session_id: session.id, role: "user", content: reply }] : []),
    { session_id: session.id, role: "assistant", content: assistantText, hint_level: action === "hint" ? Number(session.hint_level || 0) + 1 : Number(session.hint_level || 0) },
  ];
  const { error: saveMessagesError } = await sb.from("teaching_messages").insert(messageRows);
  if (saveMessagesError) {
    return schemaError(saveMessagesError)
      ? unavailable()
      : NextResponse.json({ ok: false, error: `教学回复已生成，但对话保存失败：${saveMessagesError.message}` }, { status: 500 });
  }

  const done = Boolean(ai.data.done) || action === "solution";
  const nextStep = Number(session.step || 0) + 1;
  const nextHintLevel = action === "hint" ? Math.min(3, Number(session.hint_level || 0) + 1) : Number(session.hint_level || 0);
  const { error: updateError } = await sb
    .from("teaching_sessions")
    .update({ status: done ? "done" : "active", step: nextStep, hint_level: nextHintLevel, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  let warning: string | null = updateError ? `回复已保存，但会话状态更新失败：${updateError.message}` : null;
  if (action === "start") {
    const { data: state } = await sb.from("kp_state").select("status,locked_by_user").eq("kp_id", kpId).maybeSingle();
    if (!state?.locked_by_user && state?.status !== "mastered") {
      const { error: stateError } = await sb.from("kp_state").upsert(
        { kp_id: kpId, status: "learning", source: "manual", locked_by_user: false, last_studied_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "kp_id" }
      );
      if (stateError) warning = [warning, `教学已开始，但状态保存失败：${stateError.message}`].filter(Boolean).join("；");
    }
    const { error: recordError } = await sb.from("kp_records").insert({
      kp_id: kpId,
      type: "teaching",
      title: "开始互动学习",
      detail: assistantText.slice(0, 500),
      payload: { sessionId: session.id, model: MODEL },
    });
    if (recordError) warning = [warning, `教学已开始，但学习记录写入失败：${recordError.message}`].filter(Boolean).join("；");
  }
  if (done && action !== "start") {
    const { data: currentState, error: stateReadError } = await sb.from("kp_state").select("status,locked_by_user").eq("kp_id", kpId).maybeSingle();
    if (stateReadError) warning = [warning, `教学已结束，但下一步状态读取失败：${stateReadError.message}`].filter(Boolean).join("；");
    else if (!currentState?.locked_by_user && currentState?.status === "learning") {
      const { error: stateUpdateError } = await sb.from("kp_state").update({ status: "pending", source: "manual", updated_at: new Date().toISOString() }).eq("kp_id", kpId);
      if (stateUpdateError) warning = [warning, `教学已完成，但状态未转为待测试：${stateUpdateError.message}`].filter(Boolean).join("；");
    }
    const { error: recordError } = await sb.from("kp_records").insert({
      kp_id: kpId,
      type: "teaching",
      title: "完成一轮互动学习",
      detail: "教学完成不代表已掌握；请通过专项测试确认。",
      payload: { sessionId: session.id, model: MODEL, step: nextStep },
    });
    if (recordError) warning = [warning, `教学已保存，但学习记录写入失败：${recordError.message}`].filter(Boolean).join("；");
    if (!updateError) {
      const { error: taskError } = await sb.from("kp_tasks").update({ status: "done" }).eq("kp_id", kpId).eq("type", "learn").eq("status", "pending");
      if (taskError && !schemaError(taskError)) warning = [warning, `教学已完成，但计划任务未能标记完成：${taskError.message}`].filter(Boolean).join("；");
    }
  }

  return NextResponse.json({
    ok: true,
    session: { ...session, status: done ? "done" : "active", step: nextStep, hint_level: nextHintLevel },
    assistantMessage: assistantText,
    done,
    warning,
    model: MODEL,
  });
}
