import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { QuestionType, GenTask, Difficulty, DifficultyMode } from "@/lib/types";
import { normalizeDifficulty } from "@/lib/types";
import { largestRemainder } from "@/lib/paperSelector";

export const dynamic = "force-dynamic";

const TYPE_CYCLE: QuestionType[] = [
  "single_choice",
  "single_choice",
  "multiple_choice",
  "fill_blank",
  "true_false",
  "short_answer",
];

/** 四川专升本难度比例：容易30 较易30 中等30 较难10 */
const DIFF_ORDER: Difficulty[] = ["easy", "medium_easy", "medium", "hard"];
const DIFF_WEIGHTS = [30, 30, 30, 10];

interface KpRow {
  id: string;
  content: string;
  difficulty: Difficulty;
  source_date: string;
  sections: {
    name: string;
    chapters: { name: string; subjects: { name: string } | null } | null;
  } | null;
}

function nameOf(v: unknown): string {
  if (!v) return "";
  if (Array.isArray(v)) return v[0]?.name || "";
  return (v as { name: string }).name || "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dailyCount = Number(body.dailyCount || 24);
    const todayRatio = Number(body.todayRatio || 0.6);
    const difficultyMode: DifficultyMode = body.difficultyMode || "auto";
    const kpIds: string[] = Array.isArray(body.kpIds) ? body.kpIds.filter(Boolean) : [];

    const sb = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    let q = sb
      .from("knowledge_points")
      .select("id,content,difficulty,source_date, sections(name, chapters(name, subjects(name)))");
    if (kpIds.length > 0) q = q.in("id", kpIds);
    const { data: kps, error: kpErr } = await q;
    if (kpErr) throw kpErr;

    // 每个知识点的已有题目数
    const { data: qRows } = await sb
      .from("questions")
      .select("knowledge_point_id");
    const countByKp = new Map<string, number>();
    for (const q of qRows || []) {
      countByKp.set(q.knowledge_point_id, (countByKp.get(q.knowledge_point_id) || 0) + 1);
    }

    const all = ((kps as unknown as KpRow[]) || []).filter(
      (k) => (countByKp.get(k.id) || 0) < 5
    );
    const fresh = all.filter((k) => k.source_date === today);
    const historical = all.filter((k) => k.source_date !== today);

    // 新鲜知识点优先（题目少的优先），历史知识点按已有题目数升序
    fresh.sort((a, b) => (countByKp.get(a.id) || 0) - (countByKp.get(b.id) || 0));
    historical.sort((a, b) => (countByKp.get(a.id) || 0) - (countByKp.get(b.id) || 0));

    const freshCount = Math.round(dailyCount * todayRatio);
    const chosen: KpRow[] = [];
    chosen.push(...fresh.slice(0, freshCount));
    const rest = dailyCount - chosen.length;
    // 历史里再补，若新鲜不足也从 fresh 全部用完后继续
    const freshRemainder = fresh.slice(chosen.length);
    const pool = [...freshRemainder, ...historical];
    chosen.push(...pool.slice(0, rest));

    // 按难度模式为每个任务分配难度
    const diffAlloc =
      difficultyMode === "mixed"
        ? largestRemainder(chosen.length, DIFF_WEIGHTS)
        : null;
    const diffQueue: Difficulty[] = [];
    if (diffAlloc) {
      DIFF_ORDER.forEach((d, i) => {
        for (let n = 0; n < diffAlloc[i]; n++) diffQueue.push(d);
      });
    }

    const tasks: GenTask[] = chosen.map((k, i) => {
      let difficulty: Difficulty;
      if (difficultyMode === "mixed") {
        difficulty = diffQueue[i] || "medium";
      } else if (difficultyMode !== "auto") {
        difficulty = difficultyMode;
      } else {
        difficulty = normalizeDifficulty(k.difficulty);
      }
      return {
        kpId: k.id,
        subject: k.sections?.chapters?.subjects?.name || "",
        chapter: k.sections?.chapters?.name || "",
        section: k.sections?.name || "",
        kpContent: k.content,
        questionType: TYPE_CYCLE[i % TYPE_CYCLE.length],
        difficulty,
      };
    });

    return NextResponse.json({
      tasks,
      total: tasks.length,
      freshCount: fresh.length,
      historyCount: historical.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成计划失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
