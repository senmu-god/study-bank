import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }

  const kpId = String(body?.kpId || "");
  const sectionId = String(body?.sectionId || "");
  if (!UUID.test(kpId) || !UUID.test(sectionId)) {
    return NextResponse.json({ ok: false, error: "知识点或目标章节 id 不合法" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const [{ data: kp, error: kpError }, { data: target, error: targetError }] = await Promise.all([
    sb.from("knowledge_points").select("id,content,section_id").eq("id", kpId).maybeSingle(),
    sb.from("sections").select("id,name,chapter_id").eq("id", sectionId).maybeSingle(),
  ]);
  if (kpError) return NextResponse.json({ ok: false, error: kpError.message }, { status: 500 });
  if (targetError) return NextResponse.json({ ok: false, error: targetError.message }, { status: 500 });
  if (!kp) return NextResponse.json({ ok: false, error: "知识点不存在" }, { status: 404 });
  if (!target) return NextResponse.json({ ok: false, error: "目标章节不存在" }, { status: 404 });
  if (kp.section_id === sectionId) return NextResponse.json({ ok: true, unchanged: true });

  const { data: fromSection } = await sb.from("sections").select("name,chapter_id").eq("id", kp.section_id).maybeSingle();
  const [{ data: fromChapter }, { data: toChapter }] = await Promise.all([
    fromSection
      ? sb.from("chapters").select("name,subject_id").eq("id", fromSection.chapter_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from("chapters").select("name,subject_id").eq("id", target.chapter_id).maybeSingle(),
  ]);
  if (!fromChapter || !toChapter) {
    return NextResponse.json({ ok: false, error: "无法确认章节所属科目，已取消调整。" }, { status: 409 });
  }
  if (fromChapter.subject_id !== toChapter.subject_id) {
    return NextResponse.json({ ok: false, error: "知识点只能调整到同一科目下的章节。" }, { status: 400 });
  }

  const { error: moveError } = await sb.from("knowledge_points").update({ section_id: sectionId }).eq("id", kpId);
  if (moveError) return NextResponse.json({ ok: false, error: moveError.message }, { status: 500 });

  const fromLabel = [fromChapter?.name, fromSection?.name].filter(Boolean).join(" / ");
  const toLabel = [toChapter?.name, target.name].filter(Boolean).join(" / ");
  const [audit, record] = await Promise.all([
    sb.from("kp_moves").insert({ kp_id: kpId, from_section: kp.section_id, to_section: sectionId, source: "manual" }),
    sb.from("kp_records").insert({
      kp_id: kpId,
      type: "move",
      title: "手动调整知识点归属",
      detail: `${fromLabel || "原章节"} → ${toLabel}`,
      payload: { fromSectionId: kp.section_id, toSectionId: sectionId },
    }),
  ]);

  const warnings = [audit.error && `归属审计写入失败：${audit.error.message}`, record.error && `学习流水写入失败：${record.error.message}`].filter(Boolean);
  return NextResponse.json({ ok: true, kpId, sectionId, warning: warnings.join("；") || null });
}
