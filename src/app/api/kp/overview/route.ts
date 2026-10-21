import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  KP_STATUS,
  countStatuses,
  emptyCounts,
  isKpStatus,
  progressOf,
  difficultyWeight,
  type KpStatus,
  type StatusCounts,
} from "@/lib/kpStatus";

export const dynamic = "force-dynamic";

/**
 * 章节核心度的初始值。
 * 依据：通用高等数学核心目录 + 四川专升本考纲的分值结构。
 * 这是**人工初始值**，可在章节权重表里手动覆盖；不随题量变化。
 */
const DEFAULT_CORE: { match: RegExp; core: number }[] = [
  { match: /函数.*极限.*连续/, core: 1.0 },
  { match: /一元函数微分/, core: 0.95 },
  { match: /一元函数积分/, core: 0.95 },
  { match: /多元函数/, core: 0.8 },
  { match: /无穷级数/, core: 0.7 },
  { match: /常微分方程/, core: 0.7 },
  { match: /向量代数|空间解析/, core: 0.55 },
  { match: /线性代数/, core: 0.55 },
];

function coreOf(name: string): number {
  for (const r of DEFAULT_CORE) if (r.match.test(name)) return r.core;
  return 0.6;
}

interface ChapterOut {
  id: string;
  name: string;
  order: number;
  weight: number;
  weightParts: { core: number; centrality: number; gap: number };
  weightLocked: boolean;
  weightManual: number | null;
  progress: number;
  counts: StatusCounts;
  leafCount: number;
  questionCount: number;
  coverage: { covered: number; total: number };
  /** 补题优先级（重要性 × 覆盖缺口，已归一化） */
  supplement: number;
  sections: {
    id: string;
    name: string;
    order: number;
    progress: number;
    counts: StatusCounts;
    leaves: {
      id: string;
      name: string;
      status: KpStatus;
      questionCount: number;
      difficulty: string;
      locked: boolean;
      lastStudiedAt: string | null;
    }[];
  }[];
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin();

    const [chRes, secRes, kpRes, qRes, qConceptRes] = await Promise.all([
      sb.from("chapters").select("id,name,sort_order,subject_id").order("sort_order"),
      sb.from("sections").select("id,name,chapter_id,sort_order").order("sort_order"),
      sb.from("knowledge_points").select("id,section_id,content,difficulty"),
      sb.from("questions").select("id,knowledge_point_id"),
      sb.from("question_concepts").select("question_id,kp_id"),
    ]);

    for (const r of [chRes, secRes, kpRes, qRes]) {
      if (r.error) throw r.error;
    }
    if (qConceptRes.error && !(/does not exist|schema cache/i.test(qConceptRes.error.message) || qConceptRes.error.code === "42P01" || qConceptRes.error.code === "PGRST205")) throw qConceptRes.error;

    // 可选表：迁移未执行时自动降级，不报错
    const [stateRes, detailRes, weightRes, recordsRes, testsRes, notesRes, teachingRes] = await Promise.all([
      sb.from("kp_state").select("kp_id,status,locked_by_user,last_studied_at"),
      sb.from("kp_detail").select("kp_id,display_name"),
      sb.from("chapter_weights").select("chapter_id,core,centrality,gap,weight,locked"),
      sb.from("kp_records").select("id").limit(1),
      sb.from("kp_tests").select("id").limit(1),
      sb.from("kp_notes").select("id").limit(1),
      sb.from("teaching_sessions").select("id").limit(1),
    ]);

    const schemaReady = !stateRes.error;
    const detailReady = !detailRes.error;
    const weightReady = !weightRes.error;

    const stateMap = new Map<
      string,
      { status: KpStatus; locked: boolean; lastStudiedAt: string | null }
    >();
    for (const r of (stateRes.data || []) as {
      kp_id: string;
      status: string;
      locked_by_user: boolean | null;
      last_studied_at: string | null;
    }[]) {
      stateMap.set(r.kp_id, {
        status: isKpStatus(r.status) ? r.status : "new",
        locked: Boolean(r.locked_by_user),
        lastStudiedAt: r.last_studied_at,
      });
    }

    const nameMap = new Map<string, string>();
    if (detailReady) {
      for (const r of (detailRes.data || []) as {
        kp_id: string;
        display_name: string | null;
      }[]) {
        if (r.display_name) nameMap.set(r.kp_id, r.display_name);
      }
    }

    const weightMap = new Map<
      string,
      { core: number; centrality: number; gap: number; weight: number; locked: boolean }
    >();
    if (weightReady) {
      for (const r of (weightRes.data || []) as {
        chapter_id: string;
        core: number;
        centrality: number;
        gap: number;
        weight: number;
        locked: boolean;
      }[]) {
        weightMap.set(r.chapter_id, {
          core: Number(r.core),
          centrality: Number(r.centrality),
          gap: Number(r.gap),
          weight: Number(r.weight),
          locked: Boolean(r.locked),
        });
      }
    }

    const questionIdsByKp = new Map<string, Set<string>>();
    const addQuestionLink = (kpId: string | null, questionId: string) => {
      if (!kpId) return;
      const ids = questionIdsByKp.get(kpId) || new Set<string>();
      ids.add(questionId);
      questionIdsByKp.set(kpId, ids);
    };
    for (const q of (qRes.data || []) as { id: string; knowledge_point_id: string | null }[]) addQuestionLink(q.knowledge_point_id, q.id);
    for (const link of (qConceptRes.data || []) as { kp_id: string; question_id: string }[]) addQuestionLink(link.kp_id, link.question_id);
    const qCount = new Map([...questionIdsByKp.entries()].map(([kpId, ids]) => [kpId, ids.size]));

    const chapters = (chRes.data || []) as {
      id: string;
      name: string;
      sort_order: number;
      subject_id: string | null;
    }[];
    const sections = (secRes.data || []) as {
      id: string;
      name: string;
      chapter_id: string;
      sort_order: number;
    }[];
    const kps = (kpRes.data || []) as {
      id: string;
      section_id: string;
      content: string;
      difficulty: string | null;
    }[];

    const kpsBySection = new Map<string, typeof kps>();
    for (const kp of kps) {
      const arr = kpsBySection.get(kp.section_id) || [];
      arr.push(kp);
      kpsBySection.set(kp.section_id, arr);
    }

    const sectionsByChapter = new Map<string, typeof sections>();
    for (const s of sections) {
      const arr = sectionsByChapter.get(s.chapter_id) || [];
      arr.push(s);
      sectionsByChapter.set(s.chapter_id, arr);
    }

    const allCounts = emptyCounts();
    const out: ChapterOut[] = [];

    for (const ch of chapters) {
      const chSections = (sectionsByChapter.get(ch.id) || []).sort(
        (a, b) => a.sort_order - b.sort_order
      );
      const chCounts = emptyCounts();
      let chQuestions = 0;
      let chLeafCount = 0;
      let chScoreSum = 0;
      let chWeightSum = 0;
      let covered = 0;

      const secOut: ChapterOut["sections"] = [];

      for (const sec of chSections) {
        const secKps = (kpsBySection.get(sec.id) || []).sort((a, b) =>
          a.content.localeCompare(b.content, "zh-Hans-CN")
        );
        const secCounts = emptyCounts();
        let secScoreSum = 0;
        let secWeightSum = 0;

        const leaves = secKps.map((kp) => {
          const st = stateMap.get(kp.id);
          const status: KpStatus = st?.status ?? "new";
          const qn = qCount.get(kp.id) || 0;
          secCounts[status] += 1;
          chCounts[status] += 1;
          const w = difficultyWeight(kp.difficulty);
          secScoreSum += KP_STATUS[status].score * w;
          secWeightSum += w;
          chScoreSum += KP_STATUS[status].score * w;
          chWeightSum += w;
          chLeafCount += 1;
          chQuestions += qn;
          if (qn > 0) covered += 1;
          return {
            id: kp.id,
            name: nameMap.get(kp.id) || kp.content,
            status,
            questionCount: qn,
            difficulty: kp.difficulty || "medium",
            locked: st?.locked ?? false,
            lastStudiedAt: st?.lastStudiedAt ?? null,
          };
        });

        for (const k of Object.keys(secCounts) as KpStatus[]) allCounts[k] += secCounts[k];

        secOut.push({
          id: sec.id,
          name: sec.name,
          order: sec.sort_order,
          progress: secWeightSum ? (secScoreSum / secWeightSum) * 100 : 0,
          counts: secCounts,
          leaves,
        });
      }

      const stored = weightMap.get(ch.id);
      // 只有用户手动锁定过的权重才覆盖默认值。
      // 迁移脚本里的 chapter_weights 初始行只是占位（core=0.50），
      // 若直接采信会让 8 个章节重要性全部相同，反而抹掉了章节差异。
      const core = stored?.locked ? stored.core : coreOf(ch.name);
      // 依赖中心性：由 kp_edges 计算，当前为空则为 0
      const centrality = stored?.locked ? stored.centrality : 0;
      // 覆盖缺口：题越少缺口越大。它**只用于排补题顺序**，不参与章节重要性权重，
      // 否则「题多的章节」会被误判为不重要，与「不能仅凭题量判断重要性」相悖。
      const gap = chLeafCount ? 1 - covered / chLeafCount : 0;
      // 章节重要性权重：只看核心度与依赖中心性
      const raw = stored?.locked ? Number(stored.weight) : 0.6 * core + 0.4 * centrality;

      out.push({
        id: ch.id,
        name: ch.name,
        order: ch.sort_order,
        weight: raw,
        weightParts: { core, centrality, gap },
        weightLocked: stored?.locked ?? false,
        weightManual: stored?.locked ? Number(stored.weight) : null,
        progress: chWeightSum ? (chScoreSum / chWeightSum) * 100 : 0,
        counts: chCounts,
        leafCount: chLeafCount,
        questionCount: chQuestions,
        coverage: { covered, total: chLeafCount },
        supplement: 0,
        sections: secOut,
      });
    }

    // 权重归一化到总和 1
    const rawSum = out.reduce((s, c) => s + c.weight, 0) || 1;
    for (const c of out) c.weight = c.weight / rawSum;

    // 补题优先级 = 重要性 × 覆盖缺口（缺口为 0 的章节不需要补题）
    const supSum = out.reduce((s, c) => s + c.weight * c.weightParts.gap, 0) || 1;
    for (const c of out) c.supplement = (c.weight * c.weightParts.gap) / supSum;

    const totals = {
      chapters: out.length,
      sections: out.reduce((s, c) => s + c.sections.length, 0),
      kps: kps.length,
      questions: (qRes.data || []).length,
      covered: out.reduce((s, c) => s + c.coverage.covered, 0),
      counts: allCounts,
      progress: progressOf(allCounts),
    };

    // 下一步建议：先看已有漏洞，再看补题缺口
    const suggestions = [...out]
      .filter((c) => c.counts.not_mastered + c.counts.pending > 0 || c.coverage.covered === 0)
      .sort((a, b) => {
        const gapScore = (c: typeof a) => c.counts.not_mastered * 3 + c.counts.pending * 2;
        return gapScore(b) - gapScore(a) || b.supplement - a.supplement || b.weight - a.weight;
      })
      .slice(0, 3)
      .map((c) => ({
        chapterId: c.id,
        name: c.name,
        reason:
          c.counts.not_mastered > 0
            ? `${c.counts.not_mastered} 个知识点存在漏洞`
            : c.counts.pending > 0
            ? `${c.counts.pending} 个知识点待确认`
            : c.coverage.covered === 0
            ? "该章尚无题目，先补题再诊断"
            : "可安排复测巩固",
      }));

    return NextResponse.json({
      ok: true,
      schemaReady,
      detailReady,
      weightReady,
      recordsReady: !recordsRes.error,
      testsReady: !testsRes.error,
      notesReady: !notesRes.error,
      teachingReady: !teachingRes.error,
      generatedAt: new Date().toISOString(),
      totals,
      chapters: out,
      suggestions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
