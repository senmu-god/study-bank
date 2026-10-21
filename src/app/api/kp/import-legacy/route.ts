import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const asArray = (value: unknown) => Array.isArray(value) ? value : [];
const str = (value: unknown, max = 20000) => typeof value === "string" ? value.slice(0, max) : "";

export async function POST(req: Request) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return NextResponse.json({ ok: false, error: "备份文件超过 8 MB，请先精简或分批处理。" }, { status: 413 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "请求不是有效 JSON。" }, { status: 400 }); }
  const source = body?.data;
  const rawMapping = body?.mapping;
  if (!source || !Array.isArray(source.knowledge) || !rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) {
    return NextResponse.json({ ok: false, error: "备份文件或知识点映射格式不正确。" }, { status: 400 });
  }
  if (source.knowledge.length > 5000 || asArray(source.evidence).length > 20000 || asArray(source.records).length > 20000 || asArray(source.questions).length > 20000) {
    return NextResponse.json({ ok: false, error: "备份条目数量超出安全上限。" }, { status: 413 });
  }

  const mapping: Record<string, string> = {};
  for (const [oldId, targetId] of Object.entries(rawMapping)) {
    if (!oldId || oldId.length > 200 || typeof targetId !== "string" || !UUID.test(targetId)) {
      return NextResponse.json({ ok: false, error: "映射中包含无效的知识点 ID。" }, { status: 400 });
    }
    mapping[oldId] = targetId;
  }
  const leafIds = new Set(source.knowledge
    .filter((item: any) => item && item.level === "leaf" && typeof item.id === "string")
    .map((item: any) => item.id as string));
  if (Object.keys(mapping).some((oldId) => !leafIds.has(oldId))) {
    return NextResponse.json({ ok: false, error: "只能映射备份中的叶子知识点，请重新选择文件并确认映射。" }, { status: 400 });
  }
  const targetIds = [...new Set(Object.values(mapping))];
  if (targetIds.length !== Object.keys(mapping).length) {
    return NextResponse.json({ ok: false, error: "每个题库知识点只能接收一个旧知识点映射，请调整映射后重试。" }, { status: 400 });
  }
  if (!Object.keys(mapping).length) return NextResponse.json({ ok: false, error: "请至少确认一个知识点映射。" }, { status: 400 });

  const sb = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await sb.from("knowledge_points").select("id").in("id", targetIds);
  if (lookupError) return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
  if ((existing || []).length !== targetIds.length) return NextResponse.json({ ok: false, error: "部分目标知识点已不存在，请刷新后重新映射。" }, { status: 409 });

  // Whitelist export fields. In particular, old local settings and API keys never reach the RPC.
  const safeData = {
    meta: { app: str(source.meta?.app, 100), exportedAt: str(source.meta?.exportedAt, 100) },
    knowledge: asArray(source.knowledge).map((x: any) => ({
      id: str(x?.id, 200), level: str(x?.level, 30), name: str(x?.name, 500), summary: str(x?.summary, 10000),
      formulas: asArray(x?.formulas).slice(0, 100), conditions: asArray(x?.conditions).map((v) => str(v, 1000)).slice(0, 100),
      prerequisites: asArray(x?.prerequisites).map((v) => str(v, 200)).slice(0, 100), related: asArray(x?.related).map((v) => str(v, 200)).slice(0, 100),
      errorPatterns: asArray(x?.errorPatterns).map((v) => str(v, 500)).slice(0, 100), status: str(x?.status, 40), lastStudied: str(x?.lastStudied, 100),
    })),
    evidence: asArray(source.evidence).map((x: any) => ({ kpId: str(x?.kpId, 200), questionId: str(x?.questionId, 200), quote: str(x?.quote, 500), errorType: str(x?.errorType, 200), reason: str(x?.reason, 2000), strength: str(x?.strength, 20), source: str(x?.source, 30), at: str(x?.at, 100) })),
    records: asArray(source.records).map((x: any) => ({ id: str(x?.id, 200), kpId: str(x?.kpId, 200), type: str(x?.type, 30), title: str(x?.title, 300), detail: str(x?.detail, 4000), at: str(x?.at, 100) })),
    questions: asArray(source.questions).map((x: any) => ({ id: str(x?.id, 200), code: str(x?.code, 200), title: str(x?.title, 500), content: str(x?.content, 20000), source: str(x?.source, 100), state: str(x?.state, 100), kpIds: [...new Set(asArray(x?.kpIds).map((v) => str(v, 200)).filter(Boolean))].slice(0, 100), errorType: str(x?.errorType, 200), hasSolution: x?.hasSolution === true })),
  };
  const { data, error } = await sb.rpc("kp_import_kgm_backup", { p_data: safeData, p_mapping: mapping });
  if (error) {
    const missing = error.code === "42883" || /function .*kp_import_kgm_backup.* does not exist/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "旧站导入功能不可用，请确认已按 README.md 应用对应迁移。" : error.message }, { status: missing ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, result: data });
}
