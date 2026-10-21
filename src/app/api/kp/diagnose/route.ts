import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { chatJSON, MODEL } from "@/lib/deepseek";
import type { KpStatus } from "@/lib/kpStatus";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function schemaMissing(error: { code?: string; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /schema cache|does not exist/i.test(error.message);
}

interface AiDiagnosis {
  conclusion?: string;
  gap?: string;
  error_types?: string[];
  per_question?: { questionId?: string; errorType?: string; reason?: string }[];
  confidence?: "low" | "medium" | "high";
  advice?: string;
}

const SYSTEM = `你是高等数学的学情诊断老师。你只根据给定的答题记录判断学生的知识漏洞，绝不虚构学生没有表现过的推理过程。
如果证据不足以判断，必须明确说"证据不足"，不要编造结论。
只输出 JSON，不要输出任何解释性文字。`;

/**
 * 知识点诊断。
 *
 * 判定规则（写死在代码里，不交给模型自由发挥）：
 *   - 没有答题记录        → 不诊断，明确告知证据不足
 *   - 样本 < 2            → 最多「待确认」，单次错误不足以定性
 *   - 错误率 ≥ 20% 且样本 ≥ 2 → 「未掌握」
 *   - 其余                → 「待确认」
 *   - 任何情况都不自动置为「已掌握」，掌握必须经专项测试综合评估
 *   - 用户手动锁定过的状态（locked_by_user）不被覆盖
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const kpId = String(body?.kpId || "");
  const dryRun = Boolean(body?.dryRun);
  if (!UUID.test(kpId)) {
    return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  }
  if (body?.consent !== true) {
    return NextResponse.json({ ok: false, error: "诊断会将相关题目、作答和评分发送到服务端配置的 AI。请先在页面确认后再运行。" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: kp, error: kpErr } = await sb
    .from("knowledge_points")
    .select("id,content,section_id")
    .eq("id", kpId)
    .maybeSingle();
  if (kpErr) return NextResponse.json({ ok: false, error: kpErr.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });

  const { data: section } = await sb
    .from("sections")
    .select("name,chapter_id")
    .eq("id", kp.section_id)
    .maybeSingle();
  const { data: chapter } = section
    ? await sb.from("chapters").select("name").eq("id", section.chapter_id).maybeSingle()
    : { data: null };

  // Support both new redundant kp_id links and historic question-only links.
  const [primaryQuestions, secondaryQuestions] = await Promise.all([
    sb.from("questions").select("id").eq("knowledge_point_id", kpId).limit(5000),
    sb.from("question_concepts").select("question_id").eq("kp_id", kpId).limit(5000),
  ]);
  const qError = primaryQuestions.error || (secondaryQuestions.error && !schemaMissing(secondaryQuestions.error) ? secondaryQuestions.error : null);
  if (qError) return NextResponse.json({ ok: false, error: `读取关联题目失败：${qError.message}` }, { status: 500 });
  const questionIds = [...new Set([
    ...(primaryQuestions.data || []).map((q: any) => q.id),
    ...(secondaryQuestions.data || []).map((q: any) => q.question_id),
  ])];
  const selectRecords = "id,question_id,user_answer,ocr_text,is_correct,time_spent_seconds,ai_score_percent,ai_comment,answered_at,questions(question_text,question_type,correct_answer,explanation,difficulty)";
  const [linkedRecords, directRecords] = await Promise.all([
    questionIds.length ? sb.from("answer_records").select(selectRecords).in("question_id", questionIds).order("answered_at", { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
    sb.from("answer_records").select(selectRecords).eq("kp_id", kpId).order("answered_at", { ascending: false }).limit(30),
  ]);
  const recordError = linkedRecords.error || (directRecords.error && !schemaMissing(directRecords.error) ? directRecords.error : null);
  if (recordError) return NextResponse.json({ ok: false, error: `读取答题记录失败：${recordError.message}` }, { status: 500 });
  const recordsById = new Map<string, any>();
  for (const record of [...(linkedRecords.data || []), ...(directRecords.data || [])] as any[]) recordsById.set(record.id, record);
  const rows = [...recordsById.values()].filter((r: any) => r.questions).sort((a: any, b: any) => String(b.answered_at).localeCompare(String(a.answered_at))).slice(0, 30);

  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      insufficient: true,
      sampleSize: 0,
      message: "该知识点还没有答题记录，无法诊断。先做一次专项测试。",
      stats: { total: 0, wrong: 0, errorRate: 0 },
    });
  }

  const total = rows.length;
  const wrongRows = rows.filter((r: any) => !r.is_correct);
  const errorRate = Math.round((wrongRows.length / total) * 1000) / 10; // 百分比，一位小数
  const types = [...new Set(rows.map((r: any) => r.questions.question_type))];

  const brief = rows
    .slice(0, 12)
    .map((r: any, i: number) => {
      const q = r.questions;
      const processText = [r.user_answer, r.ocr_text].filter((value) => typeof value === "string" && value.trim()).join("\n");
      return `【${i + 1}】题目ID：${r.question_id}｜答题记录ID：${r.id}｜题型：${q.question_type}｜难度：${q.difficulty}
题目：${String(q.question_text).slice(0, 220)}
参考答案：${String(q.correct_answer).slice(0, 120)}
学生作答/可见过程：${processText ? processText.slice(0, 600) : "（未提供文字过程；不得推断解题过程）"}
既有 AI 评分意见：${r.ai_comment ? String(r.ai_comment).slice(0, 300) : "（无）"}
判定：${r.is_correct ? "正确" : "错误"}${r.ai_score_percent != null ? `（AI 评分 ${r.ai_score_percent}）` : ""}`;
    })
    .join("\n\n");

  const userPrompt = `知识点：${kp.content}
所属：${chapter?.name || ""} / ${section?.name || ""}

答题统计：共 ${total} 题，错 ${wrongRows.length} 题，错误率 ${errorRate}%。题型分布：${types.join("、")}。

答题记录：
${brief}

请判断该知识点的掌握情况，输出 JSON：
{
  "conclusion": "一句话结论，说明是知识缺口、计算失误还是概念混淆",
  "gap": "具体缺哪一块（没有就写空字符串）",
  "error_types": ["错误类型，最多3个，如 概念混淆 / 计算失误 / 条件遗漏 / 方法选择错误"],
  "per_question": [{"questionId":"原样返回上面的题号对应的题目id","errorType":"该题的错误类型","reason":"简要原因"}],
  "confidence": "low | medium | high",
  "advice": "下一步该做什么，一句话"
}
注意：如果错题只有 1 道，confidence 必须是 low，并在 conclusion 里写明"仅单次错误，尚不足以定性"。`;

  const ai = await chatJSON<AiDiagnosis>(SYSTEM, userPrompt, { temperature: 0.2, maxTokens: 1200 });

  // 规则优先：模型的建议只在规则允许的范围内生效
  let suggested: KpStatus;
  let confidence: "low" | "medium" | "high";
  if (total < 2) {
    suggested = "pending";
    confidence = "low";
  } else if (errorRate >= 20) {
    suggested = "not_mastered";
    confidence = total >= 4 ? "high" : "medium";
  } else {
    suggested = "pending";
    confidence = "medium";
  }

  const aiData = ai.ok ? ai.data : null;
  const conclusion =
    aiData?.conclusion ||
    (ai.ok ? "诊断已完成，但模型未给出结论。" : `AI 调用失败：${ai.error}`);

  const payload = {
    ok: true,
    insufficient: false,
    kp: { id: kp.id, content: kp.content },
    stats: {
      total,
      wrong: wrongRows.length,
      errorRate,
      types,
      singleError: wrongRows.length === 1,
    },
    diagnosis: {
      conclusion,
      gap: aiData?.gap || "",
      errorTypes: aiData?.error_types || [],
      advice: aiData?.advice || "",
      confidence,
      suggestedStatus: suggested,
      aiUsed: ai.ok,
      aiError: ai.ok ? null : ai.error,
    },
    evidence: wrongRows.slice(0, 6).map((r: any) => ({
      answerRecordId: r.id,
      questionId: r.question_id,
      questionText: r.questions.question_text,
      userAnswer: r.user_answer,
      correctAnswer: r.questions.correct_answer,
      type: r.questions.question_type,
    })),
  };

  if (dryRun) return NextResponse.json(payload);

  // ---- 落库 ----

  // 1. 证据：错题逐条入库，能追溯回具体答题记录
  const perQ = new Map(
    (aiData?.per_question || []).map((p) => [String(p.questionId || ""), p])
  );
  const strength = wrongRows.length >= 3 ? "strong" : wrongRows.length === 2 ? "medium" : "weak";

  const evidenceInserts = wrongRows.slice(0, 6).map((r: any) => {
    const hit = perQ.get(r.question_id);
    return {
      kp_id: kpId,
      question_id: r.question_id,
      answer_record_id: r.id,
      quote: [r.user_answer, r.ocr_text].filter((value) => typeof value === "string" && value.trim()).join("\n").slice(0, 500) || "（未提供文字过程）",
      error_type: hit?.errorType || (aiData?.error_types?.[0] ?? "未分类"),
      reason: hit?.reason || null,
      strength,
      source: "diagnosis",
    };
  });

  let evidenceIds: string[] = [];
  if (evidenceInserts.length) {
    const { data: ev, error: evErr } = await sb
      .from("kp_evidence")
      .insert(evidenceInserts)
      .select("id");
    if (evErr) {
      return NextResponse.json(
        { ...payload, ok: false, error: `诊断完成，但证据写入失败：${evErr.message}` },
        { status: 500 }
      );
    }
    evidenceIds = (ev || []).map((e: any) => e.id);
  }

  // 2. 诊断结论
  const { data: diagRow, error: diagnosisWriteError } = await sb
    .from("kp_diagnoses")
    .insert({
      kp_id: kpId,
      error_rate: errorRate,
      sample_size: total,
      conclusion,
      confidence,
      suggested_status: suggested,
      model: ai.ok ? MODEL : null,
      evidence_ids: evidenceIds,
      raw: ai.ok ? aiData : { error: ai.error },
    })
    .select("id")
    .single();
  if (diagnosisWriteError || !diagRow) {
    return NextResponse.json(
      { ...payload, ok: false, error: `诊断依据已保存，但诊断记录写入失败：${diagnosisWriteError?.message || "未返回诊断记录"}` },
      { status: 500 }
    );
  }

  // 3. 状态：用户手动锁定的不动
  const { data: stateRow, error: stateReadError } = await sb
    .from("kp_state")
    .select("status,locked_by_user")
    .eq("kp_id", kpId)
    .maybeSingle();
  if (stateReadError) {
    return NextResponse.json(
      { ...payload, ok: false, error: `诊断记录已保存，但当前状态读取失败：${stateReadError.message}` },
      { status: 500 }
    );
  }

  let applied = false;
  let finalStatus = (stateRow?.status as KpStatus) || "new";
  if (!stateRow?.locked_by_user) {
    const { error: stateWriteError } = await sb.from("kp_state").upsert(
      {
        kp_id: kpId,
        status: suggested,
        source: "diagnosis",
        locked_by_user: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "kp_id" }
    );
    if (stateWriteError) {
      return NextResponse.json(
        { ...payload, ok: false, error: `诊断记录已保存，但掌握状态更新失败：${stateWriteError.message}` },
        { status: 500 }
      );
    }
    applied = true;
    finalStatus = suggested;
  }

  // 4. 流水
  const { error: recordWriteError } = await sb.from("kp_records").insert({
    kp_id: kpId,
    type: "diagnosis",
    title: `诊断：错误率 ${errorRate}%（${wrongRows.length}/${total}）`,
    detail: conclusion,
    payload: {
      suggested,
      applied,
      confidence,
      diagnosisId: diagRow?.id || null,
      evidenceCount: evidenceIds.length,
    },
  });
  if (recordWriteError) {
    return NextResponse.json(
      { ...payload, ok: false, error: `诊断已保存，但学习流水写入失败：${recordWriteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...payload,
    diagnosis: {
      ...payload.diagnosis,
      applied,
      finalStatus,
      lockedByUser: Boolean(stateRow?.locked_by_user),
      diagnosisId: diagRow?.id || null,
    },
  });
}
