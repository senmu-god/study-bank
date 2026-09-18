import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端专用 Supabase 客户端（service_role key）。
 * 仅在 API Route 中使用，绝不暴露到前端。
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "缺少环境变量 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY，请在 .env.local 或 Vercel 中配置"
    );
  }
  // Next.js 14 默认缓存 fetch GET，会导致 Supabase 查询拿到旧/空结果。
  // 这里强制所有请求不缓存。
  const noStoreFetch = (input: any, init?: any) =>
    fetch(input, { ...(init || {}), cache: "no-store" as RequestCache });

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
  return adminClient;
}
