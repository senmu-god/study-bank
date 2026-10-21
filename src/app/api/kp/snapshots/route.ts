import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const todayShanghai = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());

export async function GET() {
  const { data, error } = await getSupabaseAdmin().from("kp_progress_snapshots")
    .select("snapshot_date,total,mastered,pending,not_mastered,learning,not_started,progress")
    .order("snapshot_date", { ascending: true }).limit(90);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  return NextResponse.json({ ok: true, snapshots: data || [] });
}

/** Upsert today's real aggregate once the home page has loaded current data. */
export async function POST() {
  const sb = getSupabaseAdmin();
  const [kpsRes, statesRes] = await Promise.all([
    sb.from("knowledge_points").select("id"),
    sb.from("kp_state").select("kp_id,status"),
  ]);
  const error = kpsRes.error || statesRes.error;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
  const statuses = { mastered: 0, pending: 0, not_mastered: 0, learning: 0, not_started: 0 };
  const stateMap = new Map((statesRes.data || []).map((row: any) => [row.kp_id, row.status]));
  for (const kp of kpsRes.data || []) {
    const status = stateMap.get(kp.id);
    if (status === "mastered") statuses.mastered++;
    else if (status === "pending") statuses.pending++;
    else if (status === "not_mastered") statuses.not_mastered++;
    else if (status === "learning") statuses.learning++;
    else statuses.not_started++;
  }
  const total = kpsRes.data?.length || 0;
  const progress = total ? Math.round(((statuses.mastered + statuses.pending) / total) * 10000) / 100 : 0;
  const snapshot_date = todayShanghai();
  const { data, error: saveError } = await sb.from("kp_progress_snapshots").upsert({ snapshot_date, total, ...statuses, progress }, { onConflict: "snapshot_date" }).select("snapshot_date,total,mastered,pending,not_mastered,learning,not_started,progress").single();
  if (saveError) return NextResponse.json({ ok: false, error: saveError.message }, { status: 503 });
  return NextResponse.json({ ok: true, snapshot: data });
}
