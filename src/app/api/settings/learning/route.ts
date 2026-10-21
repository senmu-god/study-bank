import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
const unavailable = (error: { code?: string; message: string }) => error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);

export async function GET() {
  const { data, error } = await getSupabaseAdmin().from("app_settings").select("daily_limit,retest_days,review_days").eq("id", 1).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: unavailable(error) ? "学习设置表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" : error.message }, { status: unavailable(error) ? 503 : 500 });
  return NextResponse.json({ ok: true, settings: data || { daily_limit: 12, retest_days: 7, review_days: 3 } });
}

export async function PATCH(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }
  const dailyLimit = Number(body?.daily_limit);
  const retestDays = Number(body?.retest_days);
  const reviewDays = Number(body?.review_days);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 50 || !Number.isInteger(retestDays) || retestDays < 1 || retestDays > 90 || !Number.isInteger(reviewDays) || reviewDays < 1 || reviewDays > 60) {
    return NextResponse.json({ ok: false, error: "每日任务上限应为 1–50，复测间隔为 1–90 天，复习间隔为 1–60 天。" }, { status: 400 });
  }
  const { data, error } = await getSupabaseAdmin().from("app_settings")
    .upsert({ id: 1, daily_limit: dailyLimit, retest_days: retestDays, review_days: reviewDays }, { onConflict: "id" })
    .select("daily_limit,retest_days,review_days").single();
  if (error) return NextResponse.json({ ok: false, error: unavailable(error) ? "学习设置表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" : error.message }, { status: unavailable(error) ? 503 : 500 });
  return NextResponse.json({ ok: true, settings: data });
}
