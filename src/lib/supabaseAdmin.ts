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
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
