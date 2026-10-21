import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { gradeShortAnswer } from "@/lib/deepseek";
import { onWrong } from "@/lib/sm2";
import { answerImagePath, answerImageRef } from "@/lib/answerImageStorage";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

interface AnswerInput {
  questionId: string;
  userAnswer: string | null;
  timeSpentSeconds: number;
  imagePath?: string | null;
  ocrText?: string | null;
}

function normalize(v: string): string {
  return (v || "").trim().replace(/\s+/g, "").toLowerCase();
}

/** 判断题答案归一化：把"正确/错误/T/F/true/false/对/错"统一成对/错 */
function normalizeTf(v: string): string {
  const s = (v || "").trim().toLowerCase();
  // 必须**先判否定**且用完全匹配：否定词基本都含肯定词的子串
  // （"不对"含"对"、"不正确"含"正确"、"没错"含"错"），
  // 用子串匹配会把用户的答案解释成相反的意思。
  if (/^(不对|不正确|错误|错的|错|false|f|×|x|n|no|否)$/.test(s)) return "错";
  if (/^(对|正确|对的|没错|true|t|√|y|yes|是)$/.test(s)) return "对";
  return s;
}

/**
 * 填空题答案归一化：去空格、去中英文标点、转小写。
 * 只去掉**分隔符类**标点；`.` `-` `/` 保留，
 * 否则 3.14 会变成 314、example.com 会变成 examplecom。
 */
function normalizeBlank(v: string): string {
  return (v || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[,;:!?，。、；：！？""''（）【】()[\]{}]/g, "")
    .toLowerCase();
}

function gradeDeterministic(q: Question, userAnswer: string | null): boolean {
  const ua = (userAnswer || "").trim();
  const correct = q.correct_answer;
  switch (q.question_type) {
    case "single_choice":
      return normalize(ua) === normalize(correct);
    case "true_false":
      return normalizeTf(ua) === normalizeTf(correct);
    case "multiple_choice": {
      const a = ua.split("").filter((c) => /[a-d]/i.test(c)).sort().join("").toLowerCase();
      const b = correct.split("").filter((c) => /[a-d]/i.test(c)).sort().join("").toLowerCase();
      return a.length > 0 && a === b;
    }
    case "fill_blank":
      return normalizeBlank(ua) === normalizeBlank(correct);
    default:
      return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { paperId, answers } = body as { paperId: string; answers: AnswerInput[] };
    if (!paperId || !Array.isArray(answers)) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data: paperRow, error: paperReadError } = await sb
      .from("papers")
      .select("id,title,paper_type")
      .eq("id", paperId)
      .maybeSingle();
    if (paperReadError) return NextResponse.json({ error: `读取试卷失败：${paperReadError.message}` }, { status: 500 });
    const isKpTest = paperRow?.paper_type === "kp_test";
    const { data: kpTestRow, error: kpTestReadError } = isKpTest
      ? await sb.from("kp_tests").select("id,kp_id,kind").eq("paper_id", paperId).maybeSingle()
      : { data: null, error: null };
    const testKpId: string | null = kpTestRow?.kp_id || null;

    // 取整卷题目（含答案与解析、每题分值）
    const { data: pq } = await sb
      .from("paper_questions")
      .select("sort_order, points, questions(*)")
      .eq("paper_id", paperId)
      .order("sort_order");

    const rows = ((pq as unknown as Array<{ questions: Question | null; points: number | null }> | undefined) || [])
      .filter((r) => r.questions);
    const questions = rows.map((r) => r.questions!) as Question[];
    const pointOf = (qid: string) => rows.find((r) => r.questions?.id === qid)?.points ?? 1;

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    const metaMap = new Map(answers.map((a) => [a.questionId, { imagePath: answerImagePath(a.imagePath), ocrText: a.ocrText }]));

    const results: Array<{
      question: Question;
      userAnswer: string | null;
      isCorrect: boolean;
      timeSpentSeconds: number;
      aiScorePercent: number | null;
      aiComment: string | null;
      points: number;
      earned: number;
      imagePath: string | null;
      ocrText: string | null;
    }> = [];

    let correctCount = 0;
    let totalScore = 0;
    let fullScore = 0;

    // 第一步：先批量判分（简答/设计题并发调 AI，避免串行超时）
    const gradeJobs = questions.map(async (q) => {
      const input = answerMap.get(q.id);
      const userAnswer = input?.userAnswer ?? null;
      const timeSpent = input?.timeSpentSeconds ?? 0;
      const points = pointOf(q.id);
      fullScore += points;

      let isCorrect = false;
      let aiScore: number | null = null;
      let aiComment: string | null = null;
      let earned = 0;

      if (q.question_type === "short_answer" || q.question_type === "design") {
        const g = await gradeShortAnswer({
          questionText: q.question_text,
          correctAnswer: q.correct_answer,
          userAnswer: userAnswer || "",
        });
        aiScore = g.score;
        aiComment = g.comment;
        isCorrect = g.score >= 60;
        earned = Math.round((points * g.score) / 100);
      } else {
        isCorrect = gradeDeterministic(q, userAnswer);
        earned = isCorrect ? points : 0;
      }
      if (isCorrect) correctCount++;
      totalScore += earned;

      const meta = metaMap.get(q.id) || { imagePath: null, ocrText: null };
      return { question: q, userAnswer, isCorrect, timeSpentSeconds: timeSpent, aiScorePercent: aiScore, aiComment, points, earned, imagePath: meta.imagePath || null, ocrText: meta.ocrText || null };
    });
    const graded = await Promise.all(gradeJobs);
    results.push(...graded);

    // 第二步：批量写入答题记录
    // 写入 kp_id（冗余字段），让按知识点聚合不必三表 join。
    // 注意：answer_records 目前没有 ai_score_percent / ai_comment 两列
    //（schema.sql 里写了但线上库未建），简答题的 AI 分数暂不落库，
    // 只保留 is_correct 判定。补列脚本见 supabase/migrations/20261021123818_answer_ai_score.sql。
    const recordInserts = results.map((r) =>
      sb.from("answer_records").insert({
        paper_id: paperId,
        question_id: r.question.id,
        kp_id: testKpId || r.question.knowledge_point_id || null,
        user_answer: r.userAnswer,
        is_correct: r.isCorrect,
        time_spent_seconds: r.timeSpentSeconds,
        image_url: r.imagePath ? answerImageRef(r.imagePath) : null,
        ocr_text: r.ocrText || null,
      })
    );
    const insertResults = await Promise.all(recordInserts);
    for (const ir of insertResults) {
      if (ir.error) throw new Error(`写入答题记录失败: ${ir.error.message}`);
    }

    // 第三步：错题本 UPSERT
    const wrongResults = results.filter((r) => !r.isCorrect);
    if (wrongResults.length > 0) {
      const qids = wrongResults.map((r) => r.question.id);
      const { data: existingRows } = await sb
        .from("wrong_answers")
        .select("question_id,wrong_count,ease_factor")
        .in("question_id", qids);
      const existingMap = new Map((existingRows || []).map((e) => [e.question_id, e]));
      const upserts = wrongResults.map((r) => {
        const ex = existingMap.get(r.question.id);
        const newCount = ex ? Number(ex.wrong_count || 1) + 1 : 1;
        const sm2 = onWrong({
          ease_factor: Number(ex?.ease_factor || 2.5),
          interval_step: 0,
        });
        return sb
          .from("wrong_answers")
          .upsert(
            {
              question_id: r.question.id,
              wrong_count: newCount,
              last_wrong_at: new Date().toISOString(),
              mastered: false,
              next_review_at: sm2.next_review_at.toISOString(),
              ease_factor: sm2.ease_factor,
            },
            { onConflict: "question_id" }
          );
      });
      const waResults = await Promise.all(upserts);
      for (const wr of waResults) {
        if (wr.error) throw new Error(`写入错题本失败: ${wr.error.message}`);
      }
    }

    // 知识点得分率
    const kpIds = [...new Set(questions.map((q) => q.knowledge_point_id))];
    const { data: kpData } = await sb
      .from("knowledge_points")
      .select("id,content")
      .in("id", kpIds);
    const kpMap = new Map((kpData || []).map((k) => [k.id, k.content]));

    const kpStatMap = new Map<string, { kpId: string; content: string; total: number; correct: number }>();
    for (const r of results) {
      const kpId = r.question.knowledge_point_id;
      const stat = kpStatMap.get(kpId) || { kpId, content: kpMap.get(kpId) || "", total: 0, correct: 0 };
      stat.total++;
      if (r.isCorrect) stat.correct++;
      kpStatMap.set(kpId, stat);
    }

    if (testKpId) {
      const { data: testKp } = await sb
        .from("knowledge_points")
        .select("id,content")
        .eq("id", testKpId)
        .maybeSingle();
      kpStatMap.clear();
      kpStatMap.set(testKpId, {
        kpId: testKpId,
        content: testKp?.content || "",
        total: results.length,
        correct: correctCount,
      });
    }

    // 查试卷类型
    const isMock = paperRow?.paper_type === "mock";

    const total = questions.length;
    const accuracy = fullScore ? Math.round((totalScore / fullScore) * 100) : 0;
    const totalTime = results.reduce((s, r) => s + (r.timeSpentSeconds || 0), 0);

    // 专项测试写回知识点闭环。只依据本次可见的作答与分数，不推断用户未提供的解题过程；
    // 单次高分最多进入「待确认」，不会自动判为「已掌握」。
    let kpTestResult: { kpId: string; status: string; conclusion: string; locked: boolean } | null = null;
    let kpTestWarning: string | null = null;
    if (isKpTest) {
      const testRow = kpTestRow;
      if (kpTestReadError || !testRow) {
        kpTestWarning = kpTestReadError?.message || "找不到该专项测试的知识点关联记录";
      } else {
        const correctRate = results.length ? Math.round((correctCount / results.length) * 100) : accuracy;
        const questionIds = results.map((result) => result.question.id);
        const difficultyCounts = results.reduce((counts: Record<string, number>, result) => {
          const difficulty = String((result.question as any).difficulty || "unknown");
          counts[difficulty] = (counts[difficulty] || 0) + 1;
          return counts;
        }, {});
        const hasChallengeQuestion = (difficultyCounts.medium || 0) + (difficultyCounts.hard || 0) > 0;
        const independent = body?.independent === true;
        const processAnswerCount = results.filter((result) =>
          ["short_answer", "design"].includes(result.question.question_type) && String(result.userAnswer || "").trim().length >= 80
        ).length;
        const { data: previousTests, error: previousTestsError } = await sb.from("kp_tests")
          .select("score,passed,detail,created_at")
          .eq("kp_id", testRow.kp_id)
          .neq("id", testRow.id)
          .order("created_at", { ascending: false })
          .limit(20);
        if (previousTestsError) kpTestWarning = `测试已判分，但读取此前测试依据失败：${previousTestsError.message}`;
        const currentQuestionSet = [...questionIds].sort().join("|");
        const priorIndependentPass = (previousTests || []).some((previous: any) => {
          const detail = previous.detail || {};
          const previousIds = Array.isArray(detail.questionIds) ? [...detail.questionIds].sort().join("|") : "";
          return Number(previous.score) >= 80 && previous.passed === true && detail.independent === true &&
            detail.masteryReady === true && previousIds && previousIds !== currentQuestionSet;
        });
        const currentMasteryReady = correctRate >= 80 && independent && hasChallengeQuestion && questionIds.length >= 2;
        const masteryConfirmed = currentMasteryReady && priorIndependentPass && !previousTestsError;
        const conclusion = correctRate < 60
          ? `本次专项测试正确率 ${correctRate}%，证据显示该知识点仍有明显漏洞。`
          : correctRate < 80
            ? `本次专项测试正确率 ${correctRate}%，建议针对错题复习后再确认。`
            : masteryConfirmed
              ? `本次正确率 ${correctRate}%。本次与此前不同题目测试均达到 80%，包含中等或更高难度题，并声明独立完成，掌握证据达到确认条件。`
              : `本次专项测试正确率 ${correctRate}%，本次表现良好；仍需一次不同题目、独立完成且包含中等或更高难度题的测试确认掌握。`;
        const detail = {
          total: total,
          correct: correctCount,
          accuracy: correctRate,
          score: totalScore,
          fullScore,
          timeSpent: totalTime,
          wrongQuestionIds: results.filter((r) => !r.isCorrect).map((r) => r.question.id),
          questionIds,
          difficultyCounts,
          processAnswerCount,
          independent,
          masteryReady: currentMasteryReady,
        };
        const { error: testUpdateError } = await sb
          .from("kp_tests")
          .update({ score: correctRate, passed: correctRate >= 80, conclusion, detail })
          .eq("id", testRow.id);
        if (testUpdateError) kpTestWarning = `测试已判分，但结果写入失败：${testUpdateError.message}`;

        const { data: currentState, error: stateReadError } = await sb
          .from("kp_state")
          .select("status,locked_by_user")
          .eq("kp_id", testRow.kp_id)
          .maybeSingle();

        if (stateReadError) {
          kpTestWarning = [kpTestWarning, `掌握状态读取失败：${stateReadError.message}`].filter(Boolean).join("；");
        } else {
          const wasMastered = currentState?.status === "mastered";
          let nextStatus: "not_mastered" | "pending" | "mastered";
          if (testRow.kind === "retest" && wasMastered && correctRate >= 80) {
            nextStatus = "mastered";
          } else if (masteryConfirmed) {
            nextStatus = "mastered";
          } else if (correctRate < 60) {
            nextStatus = testRow.kind === "retest" && wasMastered ? "pending" : "not_mastered";
          } else {
            nextStatus = "pending";
          }

          if (currentState?.locked_by_user) {
            kpTestResult = { kpId: testRow.kp_id, status: currentState.status, conclusion, locked: true };
          } else {
            const { error: stateWriteError } = await sb.from("kp_state").upsert(
              {
                kp_id: testRow.kp_id,
                status: nextStatus,
                source: "test",
                locked_by_user: false,
                updated_at: new Date().toISOString(),
                last_studied_at: new Date().toISOString(),
              },
              { onConflict: "kp_id" }
            );
            if (stateWriteError) {
              kpTestWarning = [kpTestWarning, `测试已完成，但掌握状态更新失败：${stateWriteError.message}`].filter(Boolean).join("；");
            }
            kpTestResult = { kpId: testRow.kp_id, status: nextStatus, conclusion, locked: false };
          }
        }

        const { error: testRecordError } = await sb.from("kp_records").insert({
          kp_id: testRow.kp_id,
          type: "test",
          title: `${testRow.kind === "retest" ? "复测" : "专项测试"}：正确率 ${correctRate}%`,
          detail: conclusion,
          payload: { testId: testRow.id, paperId, kind: testRow.kind, ...detail, status: kpTestResult?.status ?? null },
        });
        if (testRecordError) kpTestWarning = [kpTestWarning, `测试结论已生成，但学习记录写入失败：${testRecordError.message}`].filter(Boolean).join("；");
        if (!testUpdateError) {
          const taskType = testRow.kind === "retest" ? "retest" : "test";
          const { error: taskError } = await sb.from("kp_tasks").update({ status: "done" }).eq("kp_id", testRow.kp_id).eq("type", taskType).eq("status", "pending");
          if (taskError && !/does not exist|schema cache/i.test(taskError.message)) kpTestWarning = [kpTestWarning, `测试已判分，但计划任务未能标记完成：${taskError.message}`].filter(Boolean).join("；");
        }
      }
    }

    // 模考：生成分析记录
    let analysis = null;
    if (isMock) {
      const weakPoints = [...kpStatMap.values()]
        .filter((k) => k.correct / k.total < 0.6)
        .map((k) => ({ kpId: k.kpId, content: k.content, rate: Math.round((k.correct / k.total) * 100) }));
      const { data: analysisRow } = await sb
        .from("mock_exam_analyses")
        .insert({
          paper_id: paperId,
          total_score: totalScore,
          correct_rate: accuracy,
          time_spent: totalTime,
          weak_points: weakPoints,
        })
        .select("id")
        .single();
      if (analysisRow) analysis = { id: analysisRow.id, weakPoints };
    }

    return NextResponse.json({
      summary: { total, correct: correctCount, accuracy, score: totalScore, fullScore, timeSpent: totalTime },
      results,
      kpStats: [...kpStatMap.values()],
      kpTest: kpTestResult,
      kpTestWarning,
      analysis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "判分失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
