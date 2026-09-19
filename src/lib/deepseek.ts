import OpenAI from "openai";
import type { QuestionType } from "./types";

function getClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少环境变量 DEEPSEEK_API_KEY");
  }
  return new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  });
}

export const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

export interface GeneratedQuestion {
  question_text: string;
  options: { label: string; text: string }[];
  correct_answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  difficulty_score: number;
}

function buildPrompt(params: {
  subject: string;
  chapter: string;
  section: string;
  kpContent: string;
  questionType: QuestionType;
  difficulty: string;
  existingSummary: string;
}) {
  const typeSpec: Record<QuestionType, string> = {
    single_choice:
      "【单选题】题目应为一个问题（以问号结尾），提供4个选项（A/B/C/D），仅一个正确答案。correct_answer 为单个字母如 \"A\"。options 必须包含4个对象。",
    multiple_choice:
      "【多选题】题目应为一个问题（以问号结尾），提供4个选项（A/B/C/D），两个或以上正确答案。correct_answer 为字母组合如 \"ABD\"。options 必须包含4个对象。",
    fill_blank:
      "【填空题】题目中用下划线 ___ 标出空位，correct_answer 为应填的答案文本（多个空用分号分隔）。options 必须为空数组 []。",
    true_false:
      "【判断题】题目必须是一句完整的陈述句（不要以问号结尾，绝不能出现\"哪一项\"\"以下哪个\"\"哪一个正确\"等选择题措辞），让学生判断这句话是对还是错。correct_answer 必须严格为 \"对\" 或 \"错\"，绝不能是字母 A/B/C/D。options 必须为空数组 []。",
    short_answer:
      "【简答题】题目为一个开放式问题，correct_answer 为参考答案要点文本。options 必须为空数组 []。",
  };

  const typeFormat: Record<QuestionType, string> = {
    single_choice: `{
  "question_text": "题目内容（以问号结尾）",
  "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
  "correct_answer": "A",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`,
    multiple_choice: `{
  "question_text": "题目内容（以问号结尾）",
  "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
  "correct_answer": "ABD",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`,
    fill_blank: `{
  "question_text": "题目内容，空位用 ___ 标出",
  "options": [],
  "correct_answer": "应填答案",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`,
    true_false: `{
  "question_text": "一句完整的陈述句（不要以问号结尾）",
  "options": [],
  "correct_answer": "对",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`,
    short_answer: `{
  "question_text": "开放式问题",
  "options": [],
  "correct_answer": "参考答案要点",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`,
  };

  return `你是一位专业的出题老师。请根据以下知识点生成一道考试题目。
知识点：${params.kpContent}
所属科目：${params.subject}
所属章节：${params.chapter} / ${params.section}
题型要求：${typeSpec[params.questionType]}
难度：${params.difficulty}
历史已出题（避免重复）：${params.existingSummary || "（暂无）"}
硬性要求：
1. 题目必须紧扣该知识点，考察核心概念或应用。
2. 题型格式必须严格遵守上述【题型要求】，不要串题型（判断题绝不能写成选择题）。
3. 提供详细的答案和解析。
4. 题目表述清晰，避免歧义。
5. 如果是计算题，请给出完整解题步骤。
6. 返回严格的 JSON 格式，不要包含 markdown 标记，不要用代码块包裹。
必须返回的 JSON 格式如下（字段名和类型严格一致）：
${typeFormat[params.questionType]}`;
}

function extractJson(text: string): GeneratedQuestion {
  let cleaned = text.trim();
  // 去除可能的 ```json ... ``` 包裹
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // 截取第一个 { 到最后一个 }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("返回内容不是 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** 按题型兜底修正 AI 返回结果，避免串题型。 */
function normalizeByType(q: GeneratedQuestion, type: QuestionType): GeneratedQuestion {
  if (type === "true_false") {
    // 判断题：答案必须是 对/错，不能是字母
    const ans = (q.correct_answer || "").trim();
    if (!["对", "错", "正确", "错误", "T", "F", "true", "false"].includes(ans)) {
      // AI 返回了字母，从解析推断
      const isCorrect = /该说法正确|题目描述正确|答案是对的|确实正确|表述正确/.test(q.explanation);
      q.correct_answer = isCorrect ? "对" : "错";
    } else {
      q.correct_answer = /对|正确|T|true/i.test(ans) ? "对" : "错";
    }
    q.options = [];
  }
  if (type === "fill_blank" || type === "short_answer") {
    q.options = [];
  }
  if (type === "single_choice" || type === "multiple_choice") {
    if (!q.options || q.options.length < 2) {
      throw new Error(`选择题缺少选项`);
    }
  }
  return q;
}

/**
 * 调用 DeepSeek 生成单题，失败自动重试 2 次，每次间隔 2 秒。
 */
export async function generateOneQuestion(params: {
  subject: string;
  chapter: string;
  section: string;
  kpContent: string;
  questionType: QuestionType;
  difficulty: string;
  existingSummary: string;
}): Promise<GeneratedQuestion> {
  const client = getClient();
  const prompt = buildPrompt(params);
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0.7,
        messages: [
          { role: "system", content: "你是严谨的考试出题专家，只输出 JSON。" },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      const content = completion.choices[0]?.message?.content || "";
      const parsed = extractJson(content);
      // 兜底校验
      if (!parsed.question_text || !parsed.correct_answer || !parsed.explanation) {
        throw new Error("返回 JSON 缺少必要字段");
      }
      if (!parsed.difficulty_score) parsed.difficulty_score = 0.5;
      return normalizeByType(parsed, params.questionType);
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("生成题目失败");
}

/**
 * 简答题 AI 判分：返回 0-100 得分与评语。
 */
export async function gradeShortAnswer(params: {
  questionText: string;
  correctAnswer: string;
  userAnswer: string;
}): Promise<{ score: number; comment: string }> {
  const client = getClient();
  const prompt = `你是一位严格的阅卷老师。请阅读以下简答题、参考答案与学生作答，给出客观评分。
题目：${params.questionText}
参考答案要点：${params.correctAnswer}
学生作答：${params.userAnswer || "（未作答）"}

请只输出 JSON：{"score": 0到100的整数, "comment": "一句评语"}`;

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: "你是严谨的阅卷老师，只输出 JSON。" },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content || "{}";
  try {
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return { score, comment: String(parsed.comment || "") };
  } catch {
    return { score: 0, comment: "AI 判分失败" };
  }
}
