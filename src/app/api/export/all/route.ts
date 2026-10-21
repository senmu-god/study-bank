import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { answerImagePath, answerImageRef } from "@/lib/answerImageStorage";

export const dynamic = "force-dynamic";

const TABLES = [
  "subjects",
  "chapters",
  "sections",
  "knowledge_points",
  "questions",
  "papers",
  "paper_questions",
  "answer_records",
  "wrong_answers",
  "mock_exam_analyses",
  "kp_state",
  "kp_detail",
  "kp_edges",
  "question_concepts",
  "kp_evidence",
  "kp_records",
  "kp_diagnoses",
  "teaching_sessions",
  "teaching_messages",
  "kp_tests",
  "kp_tasks",
  "chapter_weights",
  "kp_moves",
  "ai_suggestions",
  "kp_notes",
  "ai_question_drafts",
  "app_settings",
  "kp_legacy_imports",
  "kp_progress_snapshots",
];

/**
 * 完整数据备份：导出全部表为 JSON。
 * 只读，不修改任何数据；不包含任何密钥（密钥不在数据库中）。
 */
export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const out: Record<string, unknown> = {};
    const counts: Record<string, number> = {};

    for (const t of TABLES) {
      const rows: any[] = [];
      let offset = 0;
      let tableUnavailable = false;
      while (true) {
        let query = sb.from(t).select("*");
        if (t === "kp_state" || t === "kp_detail") query = query.order("kp_id", { ascending: true }) as typeof query;
        else if (t === "chapter_weights") query = query.order("chapter_id", { ascending: true }) as typeof query;
        else if (t === "question_concepts") query = query.order("question_id", { ascending: true }).order("kp_id", { ascending: true }) as typeof query;
        else query = query.order("id", { ascending: true }) as typeof query;
        const { data, error } = await query.range(offset, offset + 999);
        if (error) {
          // 迁移未执行时该表不存在，记录为 null 而不是让整个备份失败
          if (error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message)) {
            tableUnavailable = true;
            break;
          }
          throw new Error(`导出 ${t} 失败：${error.message}`);
        }
        rows.push(...(data || []));
        if (!data || data.length < 1000) break;
        offset += data.length;
      }
      out[t] = tableUnavailable ? null : rows;
      counts[t] = tableUnavailable ? -1 : rows.length;
    }

    // Keep private answer images portable with the database snapshot. Both the
    // stable storage:// refs and legacy signed URLs resolve to the same object.
    const answerRows = Array.isArray(out.answer_records) ? out.answer_records as Record<string, any>[] : [];
    const imagePaths = [...new Set(answerRows.map((row) => {
      if (typeof row.image_url !== "string" || !row.image_url.trim()) return null;
      const path = answerImagePath(row.image_url);
      if (!path) throw new Error(`答题记录 ${row.id} 的图片引用格式不受支持，已停止备份以避免遗漏文件。`);
      return path;
    }).filter((path): path is string => Boolean(path)))];
    const storageObjects: { bucket: string; path: string; contentType: string; dataBase64: string }[] = [];
    let totalImageBytes = 0;
    for (const path of imagePaths) {
      const { data, error } = await sb.storage.from("answer-images").download(path);
      if (error || !data) throw new Error(`导出答题图片 ${path} 失败：${error?.message || "对象不存在"}`);
      const bytes = Buffer.from(await data.arrayBuffer());
      totalImageBytes += bytes.byteLength;
      if (totalImageBytes > 60 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: "答题图片总量超过 60 MB，完整备份已停止，避免生成不完整文件。请先从 Supabase Storage 另行备份 answer-images 桶。" }, { status: 413 });
      }
      storageObjects.push({ bucket: "answer-images", path, contentType: data.type || "image/jpeg", dataBase64: bytes.toString("base64") });
    }
    for (const row of answerRows) {
      const path = answerImagePath(row.image_url);
      if (path) row.image_url = answerImageRef(path);
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 2,
      counts,
      tables: out,
      storageObjects,
    };
    const json = JSON.stringify(payload, null, 2);
    if (Buffer.byteLength(json, "utf8") > 100 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "完整备份超过 100 MB，无法通过当前网页还原接口安全处理；请从 Supabase 导出数据库并单独备份 answer-images 存储桶。" }, { status: 413 });
    }

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="study-bank-backup-${new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, "-")}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "导出失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
