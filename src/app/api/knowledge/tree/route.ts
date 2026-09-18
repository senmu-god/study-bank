import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SubjectNode, ChapterNode, SectionNode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data: subjects, error: subjErr } = await sb
      .from("subjects")
      .select("id,name,description,created_at")
      .order("created_at", { ascending: true });
    if (subjErr) throw subjErr;
    const { data: chapters } = await sb.from("chapters").select("*").order("sort_order");
    const { data: sections } = await sb.from("sections").select("*").order("sort_order");
    const { data: kps, error: kpErr } = await sb.from("knowledge_points").select("*").order("created_at");
    if (kpErr) throw kpErr;

    const tree: SubjectNode[] = (subjects || []).map((s) => ({
      ...s,
      chapters: (chapters || [])
        .filter((c) => c.subject_id === s.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          sort_order: c.sort_order,
          sections: (sections || [])
            .filter((sec) => sec.chapter_id === c.id)
            .map((sec) => ({
              id: sec.id,
              name: sec.name,
              sort_order: sec.sort_order,
              kps: (kps || []).filter((k) => k.section_id === sec.id),
            })),
        })),
    }));

    return NextResponse.json({ tree, totalKp: (kps || []).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
