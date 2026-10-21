import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * 系统状态。只返回「是否配置」，绝不返回任何密钥内容。
 */
export async function GET() {
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  const aiConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const passwordConfigured = Boolean(process.env.SITE_ACCESS_PASSWORD);
  const passwordLength = (process.env.SITE_ACCESS_PASSWORD || "").length;

  let dbReachable = false;
  let schemaReady = false;
  let dbError = "";

  try {
    const sb = getSupabaseAdmin();
    // 注意：这里不能用 head:true。HEAD 请求没有响应体，
    // 表不存在时 supabase-js 拿不到错误体，会误判为「已建表」。
    const { error } = await sb.from("knowledge_points").select("id").limit(1);
    if (error) dbError = error.message;
    else dbReachable = true;

    const { error: stateErr } = await sb.from("kp_state").select("kp_id").limit(1);
    schemaReady = !stateErr;
    if (stateErr && !dbError) dbError = stateErr.message;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "数据库不可达";
  }

  return NextResponse.json({
    ok: true,
    ai: { configured: aiConfigured, model },
    access: { passwordConfigured, passwordLength },
    db: { reachable: dbReachable, schemaReady, error: dbError || null },
  });
}
