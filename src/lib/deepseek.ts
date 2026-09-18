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
  const typeName: Record<QuestionType, string> = {
    single_choice: "单选题（4个选项 A/B/C/D，仅一个正确答案）",
    multiple_choice: "多选题（4个选项 A/B/C/D，两个或以上正确答案，correct_answer 为字母组合如 ABD）",
    fill_blank: "填空题",
    true_false: "判断题（correct_answer 为 对 / 错）",
    short_answer: "简答题",
  };

  return `你是一位专业的出题老师。请根据以下知识点生成一道考试题目。
知识点：${params.kpContent}
所属科目：${params.subject}
所属章节：${params.chapter} / ${params.section}
题型：${typeName[params.questionType]}
难度：${params.difficulty}
历史已出题（避免重复）：${params.existingSummary || "（暂无）"}
要求：
1. 题目必须紧扣该知识点，考察核心概念或应用。
2. 如果是选择题，提供4个选项（A/B/C/D），只有一个正确答案（单选）或多个正确答案（多选）。
3. 提供详细的答案和解析，解析要说明为什么正确、为什么其他选项错误。
4. 题目表述清晰，避免歧义。
5. 如果是计算题，请给出完整解题步骤。
6. 返回严格的 JSON 格式，不要包含 markdown 标记，不要用代码块包裹。
返回格式：
{
  "question_text": "题目内容",
  "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
  "correct_answer": "A",
  "explanation": "详细解析...",
  "difficulty": "medium",
  "difficulty_score": 0.50
}`;
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
      return parsed;
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
