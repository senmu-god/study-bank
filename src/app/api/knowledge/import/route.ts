import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { ParsedImportItem } from "@/lib/types";

export const dynamic = "force-dynamic";

async function upsertHierarchy(sb: ReturnType<typeof getSupabaseAdmin>, items: ParsedImportItem[]) {
  // 收集所有 (subject, chapter, section) 三元组
  const triples = new Set<string>();
  for (const it of items) {
    if (!it.subject || !it.chapter || !it.section || !it.content) continue;
    triples.add(`${it.subject}||${it.chapter}||${it.section}`);
  }

  const subjectNames = [...new Set([...triples].map((t) => t.split("||")[0]))];
  const chapterNames = [...new Set([...triples].map((t) => t.split("||").slice(0, 2).join("||")))];
  const sectionNames = [...triples];

  // 科目
  const { data: existingSubjects } = await sb.from("subjects").select("id,name");
  const subjectMap = new Map<string, string>((existingSubjects || []).map((s) => [s.name, s.id]));
  const missingSubjects = subjectNames.filter((n) => !subjectMap.has(n));
  if (missingSubjects.length > 0) {
    const { data: inserted } = await sb
      .from("subjects")
      .insert(missingSubjects.map((name) => ({ name })))
      .select("id,name");
    for (const row of inserted || []) subjectMap.set(row.name, row.id);
  }

  // 章节
  const { data: existingChapters } = await sb
    .from("chapters")
    .select("id,name,subject_id");
  const chapterMap = new Map<string, string>(
    (existingChapters || []).map((c) => [`${c.name}||${c.subject_id}`, c.id])
  );
  const chaptersToInsert: { name: string; subject_id: string }[] = [];
  for (const key of chapterNames) {
    const [chName, subjName] = key.split("||");
    if (!chapterMap.has(`${chName}||${subjectMap.get(subjName)}`)) {
      chaptersToInsert.push({ name: chName, subject_id: subjectMap.get(subjName)! });
    }
  }
  if (chaptersToInsert.length > 0) {
    const { data: inserted } = await sb
      .from("chapters")
      .insert(chaptersToInsert)
      .select("id,name,subject_id");
    for (const row of inserted || []) chapterMap.set(`${row.name}||${row.subject_id}`, row.id);
  }

  // 小节
  const { data: existingSections } = await sb
    .from("sections")
    .select("id,name,chapter_id");
  const sectionMap = new Map<string, string>(
    (existingSections || []).map((s) => [`${s.name}||${s.chapter_id}`, s.id])
  );
  const sectionsToInsert: { name: string; chapter_id: string }[] = [];
  for (const tripleKey of sectionNames) {
    const [subjName, chName, secName] = tripleKey.split("||");
    const chapterId = chapterMap.get(`${chName}||${subjectMap.get(subjName)}`);
    if (!chapterId) continue;
    if (!sectionMap.has(`${secName}||${chapterId}`)) {
      sectionsToInsert.push({ name: secName, chapter_id: chapterId });
    }
  }
  if (sectionsToInsert.length > 0) {
    const { data: inserted } = await sb
      .from("sections")
      .insert(sectionsToInsert)
      .select("id,name,chapter_id");
    for (const row of inserted || []) sectionMap.set(`${row.name}||${row.chapter_id}`, row.id);
  }

  return { subjectMap, chapterMap, sectionMap };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = (body.items || []) as ParsedImportItem[];
    if (items.length === 0) return NextResponse.json({ error: "无数据" }, { status: 400 });

    const sb = getSupabaseAdmin();
    const { subjectMap, chapterMap, sectionMap } = await upsertHierarchy(sb, items);

    const rows = items
      .filter((it) => it.subject && it.chapter && it.section && it.content)
      .map((it) => {
        const sectionId = sectionMap.get(
          `${it.section}||${chapterMap.get(`${it.chapter}||${subjectMap.get(it.subject)}`)}`
        );
        return {
          section_id: sectionId,
          content: it.content,
          difficulty: it.difficulty || "medium",
          tags: it.tags || [],
        };
      })
      .filter((r) => r.section_id);

    const { error } = await sb.from("knowledge_points").insert(rows);
    if (error) throw error;

    return NextResponse.json({ imported: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导入失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
