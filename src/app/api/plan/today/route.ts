import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isKpStatus, type KpStatus } from "@/lib/kpStatus";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type TaskType = "learn" | "test" | "retest" | "review";
const TASK_TYPES: TaskType[] = ["learn", "test", "retest", "review"];
const shanghaiDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return shanghaiDate(d);
};

const DEFAULT_CORE: { match: RegExp; value: number }[] = [
  { match: /函数.*极限.*连续/, value: 1.0 },
  { match: /一元函数微分/, value: 0.95 },
  { match: /一元函数积分/, value: 0.95 },
  { match: /多元函数/, value: 0.8 },
  { match: /无穷级数/, value: 0.7 },
  { match: /常微分方程/, value: 0.7 },
  { match: /向量代数|空间解析/, value: 0.55 },
  { match: /线性代数/, value: 0.55 },
];

function defaultChapterCore(name: string) {
  return DEFAULT_CORE.find((item) => item.match.test(name))?.value ?? 0.6;
}

function errorTypeWeight(value: unknown) {
  const type = String(value || "");
  if (/概念混淆|条件遗漏|方法选择/.test(type)) return 1.25;
  if (/计算失误|粗心/.test(type)) return 0.85;
  return 1;
}

function unavailable(error: { code?: string; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

async function makeTodayPlan(sb: ReturnType<typeof getSupabaseAdmin>) {
  const today = shanghaiDate();
  const [settingsRes, kpsRes, statesRes, weightsRes, testsRes, diagnosesRes, evidenceRes, edgesRes, taskRes, deferredLearnRes] = await Promise.all([
    sb.from("app_settings").select("daily_limit,retest_days,review_days").eq("id", 1).maybeSingle(),
    sb.from("knowledge_points").select("id,content,sections!inner(id,chapters!inner(id))"),
    sb.from("kp_state").select("kp_id,status,locked_by_user,last_studied_at,updated_at"),
    sb.from("chapter_weights").select("chapter_id,weight,core,centrality,locked"),
    sb.from("kp_tests").select("kp_id,kind,score,passed,created_at").order("created_at", { ascending: false }).limit(5000),
    sb.from("kp_diagnoses").select("kp_id,error_rate,created_at").order("created_at", { ascending: false }).limit(5000),
    sb.from("kp_evidence").select("kp_id,error_type,created_at").eq("source", "diagnosis").order("created_at", { ascending: false }).limit(5000),
    sb.from("kp_edges").select("from_kp,to_kp,type").eq("type", "prereq").limit(10000),
    sb.from("kp_tasks").select("id,kp_id,task_date,type,priority,source,status,due_at").gte("task_date", today).eq("status", "pending"),
    sb.from("kp_records").select("kp_id,created_at").eq("type", "status").contains("payload", { action: "defer_auto_learning" }).order("created_at", { ascending: false }).limit(5000),
  ]);
  const failed = [settingsRes, kpsRes, statesRes, weightsRes, testsRes, diagnosesRes, evidenceRes, edgesRes, taskRes, deferredLearnRes].find((res) => res.error);
  if (failed?.error) throw Object.assign(new Error(failed.error.message), { code: failed.error.code });

  const settings = settingsRes.data || { daily_limit: 12, retest_days: 7, review_days: 3 };
  const dailyLimit = Math.min(50, Math.max(1, Number(settings.daily_limit) || 12));
  const states = new Map((statesRes.data || []).map((x: any) => [x.kp_id, x]));
  const weights = new Map((weightsRes.data || []).map((x: any) => [x.chapter_id, x]));
  const latestTest = new Map<string, any>();
  for (const row of testsRes.data || []) if (!latestTest.has(row.kp_id)) latestTest.set(row.kp_id, row);
  const latestDiagnosis = new Map<string, any>();
  for (const row of diagnosesRes.data || []) if (!latestDiagnosis.has(row.kp_id)) latestDiagnosis.set(row.kp_id, row);
  const latestErrorType = new Map<string, string>();
  for (const row of evidenceRes.data || []) if (!latestErrorType.has(row.kp_id)) latestErrorType.set(row.kp_id, row.error_type || "");
  const downstreamCounts = new Map<string, number>();
  for (const edge of edgesRes.data || []) downstreamCounts.set(edge.from_kp, (downstreamCounts.get(edge.from_kp) || 0) + 1);
  const deferredLearnAt = new Map<string, string>();
  for (const row of deferredLearnRes.data || []) if (!deferredLearnAt.has(row.kp_id)) deferredLearnAt.set(row.kp_id, row.created_at);
  const chapterRaw = new Map<string, number>();
  for (const kp of (kpsRes.data || []) as any[]) {
    const section = Array.isArray(kp.sections) ? kp.sections[0] : kp.sections;
    const chapter = Array.isArray(section?.chapters) ? section.chapters[0] : section?.chapters;
    if (!chapter) continue;
    const row: any = weights.get(chapter.id);
    const raw = row?.locked
      ? Math.max(0.05, Number(row.weight) || 0.05)
      : 0.6 * defaultChapterCore(chapter.name) + 0.4 * (row?.locked ? Number(row.centrality) || 0 : 0);
    chapterRaw.set(chapter.id, raw);
  }
  const meanChapterWeight = chapterRaw.size
    ? [...chapterRaw.values()].reduce((sum, value) => sum + value, 0) / chapterRaw.size
    : 1;

  const existing = (taskRes.data || []) as any[];
  const existingKeys = new Set(existing.map((t) => `${t.kp_id}:${t.type}`));
  const dayCounts = new Map<string, number>();
  for (const task of existing) if (task.status === "pending") dayCounts.set(task.task_date, (dayCounts.get(task.task_date) || 0) + 1);
  // Complete/passed outcomes should not keep stale auto-generated tasks alive.
  const candidates: { kp_id: string; type: TaskType; priority: number }[] = [];
  for (const kp of (kpsRes.data || []) as any[]) {
    const section = Array.isArray(kp.sections) ? kp.sections[0] : kp.sections;
    const chapter = Array.isArray(section?.chapters) ? section.chapters[0] : section?.chapters;
    if (!section || !chapter) continue;
    const currentState: any = states.get(kp.id);
    const status = currentState?.status || "new";
    if (!isKpStatus(status)) continue;
    const diagnosis = latestDiagnosis.get(kp.id);
    const errorRate = Math.max(0, Math.min(100, Number(diagnosis?.error_rate) || 0));
    const weight = (chapterRaw.get(chapter.id) || meanChapterWeight) / (meanChapterWeight || 1);
    const errorMultiplier = errorTypeWeight(latestErrorType.get(kp.id));
    const downstream = Math.min(20, (downstreamCounts.get(kp.id) || 0) * 4);
    const severity = Math.round(errorRate * weight * 0.15 * errorMultiplier + downstream);
    let type: TaskType | null = null;
    let base = 0;
    const previousTest = latestTest.get(kp.id);
    const lastActivity = previousTest?.created_at || currentState?.last_studied_at || currentState?.updated_at;
    const ageDays = lastActivity
      ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000)
      : Number.POSITIVE_INFINITY;
    if (status === "not_mastered" || status === "learning" || status === "new") {
      type = "learn";
      base = status === "new" ? 50 : 60;
    } else if (status === "pending") {
      if (!previousTest) {
        type = "test";
        base = 110;
      } else if (ageDays >= Number(settings.retest_days || 7)) {
        type = "retest";
        base = 110;
      }
    } else if (status === "mastered" && ageDays >= Number(settings.review_days || 3)) {
      type = "review";
      base = 75;
    }
    const skippedAt = deferredLearnAt.get(kp.id);
    const newestSignalAt = [diagnosis?.created_at, currentState?.updated_at, currentState?.last_studied_at]
      .filter(Boolean)
      .sort()
      .at(-1);
    const learningWasDeferred = type === "learn" && skippedAt && (!newestSignalAt || skippedAt >= newestSignalAt);
    if (type && !learningWasDeferred && !existingKeys.has(`${kp.id}:${type}`)) candidates.push({ kp_id: kp.id, type, priority: Math.min(160, base + severity) });
  }

  candidates.sort((a, b) => {
    const dueTest = (type: TaskType) => type === "test" || type === "retest" ? 1 : 0;
    return dueTest(b.type) - dueTest(a.type) || b.priority - a.priority || a.kp_id.localeCompare(b.kp_id);
  });
  const insertRows: Record<string, unknown>[] = [];
  const currentKeys = new Set(existing.map((t) => `${t.kp_id}:${t.type}:${t.task_date}`));
  const planned = [...existing] as any[];
  const nextOpenDate = (kpId: string, type: TaskType, start: string) => {
    let date = start;
    while ((dayCounts.get(date) || 0) >= dailyLimit || currentKeys.has(`${kpId}:${type}:${date}`)) date = addDays(date, 1);
    return date;
  };
  for (const item of candidates) {
    let date = today;
    if (item.type === "test" || item.type === "retest") {
      while ((dayCounts.get(today) || 0) >= dailyLimit) {
        const victim = planned
          .filter((task) => task.task_date === today && task.type !== "test" && task.type !== "retest")
          .sort((a, b) => a.priority - b.priority || (a.source === "manual" ? 1 : -1))[0];
        if (!victim) {
          date = nextOpenDate(item.kp_id, item.type, addDays(today, 1));
          break;
        }
        const movedDate = nextOpenDate(victim.kp_id, victim.type, addDays(today, 1));
        const { error } = await sb.from("kp_tasks").update({ task_date: movedDate, due_at: `${movedDate}T09:00:00+08:00` }).eq("id", victim.id);
        if (error) throw Object.assign(new Error(`顺延低优先级任务失败：${error.message}`), { code: error.code });
        currentKeys.delete(`${victim.kp_id}:${victim.type}:${today}`);
        currentKeys.add(`${victim.kp_id}:${victim.type}:${movedDate}`);
        dayCounts.set(today, (dayCounts.get(today) || 1) - 1);
        dayCounts.set(movedDate, (dayCounts.get(movedDate) || 0) + 1);
        victim.task_date = movedDate;
        victim.due_at = `${movedDate}T09:00:00+08:00`;
      }
    } else {
      date = nextOpenDate(item.kp_id, item.type, today);
    }
    dayCounts.set(date, (dayCounts.get(date) || 0) + 1);
    currentKeys.add(`${item.kp_id}:${item.type}:${date}`);
    insertRows.push({ ...item, task_date: date, due_at: `${date}T09:00:00+08:00`, source: "auto", status: "pending" });
  }
  if (insertRows.length) {
    const { error } = await sb.from("kp_tasks").upsert(insertRows, { onConflict: "kp_id,task_date,type", ignoreDuplicates: true });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
  }
  return { today, settings, created: insertRows.length };
}

async function readTasks(sb: ReturnType<typeof getSupabaseAdmin>, today: string) {
  const [settingsRes, tasksRes] = await Promise.all([
    sb.from("app_settings").select("daily_limit,retest_days,review_days").eq("id", 1).maybeSingle(),
    sb.from("kp_tasks").select("id,kp_id,task_date,type,priority,source,status,due_at").gte("task_date", today).eq("status", "pending").order("priority", { ascending: false }),
  ]);
  const error = tasksRes.error || settingsRes.error;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  const settings = settingsRes.data || { daily_limit: 12, retest_days: 7, review_days: 3 };
  const tasks = (tasksRes.data || []) as any[];
  const kpIds = [...new Set(tasks.map((t) => t.kp_id))];
  const kpMap = new Map<string, { name: string; status: KpStatus; chapter: string; section: string }>();
  if (kpIds.length) {
    const [kps, states] = await Promise.all([
      sb.from("knowledge_points").select("id,content,sections(name,chapters(name))").in("id", kpIds),
      sb.from("kp_state").select("kp_id,status").in("kp_id", kpIds),
    ]);
    const stateMap = new Map((states.data || []).map((s: any) => [s.kp_id, s.status]));
    for (const k of (kps.data || []) as any[]) {
      const sec = Array.isArray(k.sections) ? k.sections[0] : k.sections;
      const ch = Array.isArray(sec?.chapters) ? sec.chapters[0] : sec?.chapters;
      const rawStatus = stateMap.get(k.id);
      kpMap.set(k.id, { name: k.content, status: isKpStatus(rawStatus) ? rawStatus : "new", chapter: ch?.name || "", section: sec?.name || "" });
    }
  }
  const limit = Math.max(1, Number(settings.daily_limit) || 12);
  const todayTasks = tasks.filter((t) => t.task_date === today);
  const futureTasks = tasks.filter((t) => t.task_date > today).sort((a, b) => a.task_date.localeCompare(b.task_date) || b.priority - a.priority);
  const sorted = [...todayTasks].sort((a, b) => {
    const dueScore = (t: any) => t.type === "test" || t.type === "retest" ? 1 : 0;
    return dueScore(b) - dueScore(a) || b.priority - a.priority || (a.source === "manual" ? -1 : 1);
  });
  return {
    settings,
    tasks: sorted.slice(0, limit).map((t) => ({ ...t, kpName: kpMap.get(t.kp_id)?.name || "", kpStatus: kpMap.get(t.kp_id)?.status || "new", chapter: kpMap.get(t.kp_id)?.chapter || "", section: kpMap.get(t.kp_id)?.section || "" })),
    pushedOut: [...sorted.slice(limit), ...futureTasks].map((t) => ({ id: t.id, kpName: kpMap.get(t.kp_id)?.name || "", type: t.type, taskDate: t.task_date })),
  };
}

export async function GET() {
  const sb = getSupabaseAdmin();
  const today = shanghaiDate();
  try {
    const result = await readTasks(sb, today);
    return NextResponse.json({ ok: true, ready: true, date: today, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    const ready = !unavailable(err as any);
    return NextResponse.json({ ok: true, ready, date: today, settings: { daily_limit: 12, retest_days: 7, review_days: 3 }, tasks: [], pushedOut: [], error: ready ? message : undefined });
  }
}

/** Build a plan without overwriting tasks the user already changed. */
export async function POST() {
  const sb = getSupabaseAdmin();
  try {
    const generated = await makeTodayPlan(sb);
    const result = await readTasks(sb, generated.today);
    return NextResponse.json({ ok: true, ready: true, date: generated.today, created: generated.created, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成计划失败";
    const ready = !unavailable(err as any);
    return NextResponse.json({ ok: false, ready, error: ready ? message : "计划表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" }, { status: ready ? 500 : 503 });
  }
}

/** User-controlled task priority, completion and manual scheduling. */
export async function PATCH(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }
  const sb = getSupabaseAdmin();
  const taskId = typeof body?.id === "string" ? body.id : "";
  if (taskId) {
    if (!UUID.test(taskId)) return NextResponse.json({ ok: false, error: "任务 id 不合法" }, { status: 400 });
    const changes: Record<string, unknown> = {};
    if (Number.isInteger(body.priority)) changes.priority = Math.max(0, Math.min(160, body.priority));
    if (["pending", "done", "skipped", "deferred"].includes(body.status)) changes.status = body.status;
    if (typeof body.taskDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.taskDate)) changes.task_date = body.taskDate;
    if (!Object.keys(changes).length) return NextResponse.json({ ok: false, error: "没有有效的任务变更" }, { status: 400 });
    const { data, error } = await sb.from("kp_tasks").update(changes).eq("id", taskId).select("id,kp_id,task_date,type,priority,source,status,due_at").maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: "任务不存在" }, { status: 404 });
    let warning: string | null = null;
    if (data.type === "learn" && data.status === "skipped") {
      const { error: recordError } = await sb.from("kp_records").insert({
        kp_id: data.kp_id,
        type: "status",
        title: "暂不安排自动学习",
        detail: "用户选择暂不将该知识点自动加入每日学习任务。",
        payload: { action: "defer_auto_learning", taskId: data.id, taskDate: data.task_date },
      });
      if (recordError) warning = `任务已跳过，但暂缓记录保存失败：${recordError.message}`;
    }
    return NextResponse.json({ ok: true, task: data, warning });
  }
  const kpId = String(body?.kpId || "");
  const type = body?.type as TaskType;
  const date = typeof body?.taskDate === "string" ? body.taskDate : shanghaiDate();
  if (!UUID.test(kpId) || !TASK_TYPES.includes(type) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: "知识点、任务类型或日期不合法" }, { status: 400 });
  const priority = Number.isInteger(body.priority) ? Math.max(0, Math.min(160, body.priority)) : 80;
  const { data, error } = await sb.from("kp_tasks").upsert({ kp_id: kpId, task_date: date, type, priority, source: "manual", status: "pending", due_at: `${date}T09:00:00+08:00` }, { onConflict: "kp_id,task_date,type" }).select("id,kp_id,task_date,type,priority,source,status,due_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, task: data });
}
