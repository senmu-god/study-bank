import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isKpStatus, KP_STATUS, type KpStatus } from "@/lib/kpStatus";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 手动修改知识点状态。
 *
 * 规则（对应需求第七节）：
 *   - 用户手动改过的状态标记 locked_by_user=true，AI 后续不得覆盖；
 *   - 每次改动写入 kp_records，保留 before/after，可追溯、可回退；
 *   - 不删除任何历史记录，删除必须由用户单独确认。
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const kpId = String(body?.kpId || "");
  const status = body?.status as KpStatus;
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : "";

  if (!UUID.test(kpId)) {
    return NextResponse.json({ ok: false, error: "kpId 不合法" }, { status: 400 });
  }
  if (!isKpStatus(status)) {
    return NextResponse.json({ ok: false, error: "状态不合法" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: before, error: readErr } = await sb
    .from("kp_state")
    .select("kp_id,status,locked_by_user")
    .eq("kp_id", kpId)
    .maybeSingle();

  if (readErr) {
    // 表不存在时给出明确提示，不静默失败
    const notReady = /does not exist|relation .* does not exist|schema cache/i.test(readErr.message);
    return NextResponse.json(
      {
        ok: false,
        schemaReady: false,
        error: notReady
          ? "知识状态表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。"
          : readErr.message,
      },
      { status: notReady ? 503 : 500 }
    );
  }

  const prev = (before?.status as KpStatus | undefined) ?? "new";
  if (prev === status && before?.locked_by_user) {
    return NextResponse.json({ ok: true, unchanged: true, status });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await sb.from("kp_state").upsert(
    {
      kp_id: kpId,
      status,
      source: "manual",
      locked_by_user: true,
      updated_at: now,
      ...(status === "learning" ? { last_studied_at: now } : {}),
    },
    { onConflict: "kp_id" }
  );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // 流水：失败不影响主流程，但要返回给前端提示
  const { error: logErr } = await sb.from("kp_records").insert({
    kp_id: kpId,
    type: "status",
      title: `手动${prev === status ? "锁定" : "改为"}「${KP_STATUS[status].label}」`,
    detail: note || null,
    payload: { from: prev, to: status, source: "manual" },
  });

  return NextResponse.json({
    ok: true,
    status,
    previous: prev,
    locked: true,
    warning: logErr ? `状态已保存，但流水写入失败：${logErr.message}` : null,
  });
}
