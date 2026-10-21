import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }
  const chapterId = String(body?.chapterId || "");
  if (!UUID.test(chapterId)) return NextResponse.json({ ok: false, error: "章节 id 不合法" }, { status: 400 });
  const sb = getSupabaseAdmin();
  const { data: chapter, error: chapterError } = await sb.from("chapters").select("id").eq("id", chapterId).maybeSingle();
  if (chapterError) return NextResponse.json({ ok: false, error: chapterError.message }, { status: 500 });
  if (!chapter) return NextResponse.json({ ok: false, error: "章节不存在" }, { status: 404 });

  const unlocking = body?.locked === false;
  const weight = Number(body?.weight);
  if (!unlocking && (!Number.isFinite(weight) || weight < 0.05 || weight > 1)) {
    return NextResponse.json({ ok: false, error: "相对权重应在 0.05 到 1.00 之间。" }, { status: 400 });
  }
  const values: Record<string, unknown> = unlocking
    ? { chapter_id: chapterId, locked: false, updated_at: new Date().toISOString() }
    : { chapter_id: chapterId, core: weight, centrality: weight, gap: 0, weight, locked: true, updated_at: new Date().toISOString() };
  const { error } = await sb.from("chapter_weights").upsert(values, { onConflict: "chapter_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, locked: !unlocking, weight: unlocking ? null : weight });
}
