import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { answerImagePath, answerImageRef } from "@/lib/answerImageStorage";

export const dynamic = "force-dynamic";
const MAX_BYTES = 100 * 1024 * 1024;
const CORE_TABLES = ["subjects", "chapters", "sections", "knowledge_points", "questions", "papers", "paper_questions", "answer_records", "wrong_answers", "mock_exam_analyses"];

export async function POST(req: Request) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return NextResponse.json({ ok: false, error: "备份文件超过 100 MB。" }, { status: 413 });
  let backup: any;
  try { backup = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "文件不是有效 JSON。" }, { status: 400 }); }
  if (backup?.version !== 2 || !backup.tables || typeof backup.tables !== "object" || Array.isArray(backup.tables)) {
    return NextResponse.json({ ok: false, error: "只支持由本网站导出的完整 study-bank v2 JSON 备份。" }, { status: 400 });
  }
  for (const table of CORE_TABLES) {
    if (!Array.isArray(backup.tables[table])) return NextResponse.json({ ok: false, error: `备份缺少核心数据表：${table}` }, { status: 400 });
  }
  for (const [table, rows] of Object.entries(backup.tables) as [string, any][]) {
    if (rows !== null && (!Array.isArray(rows) || rows.length > 100000)) {
      return NextResponse.json({ ok: false, error: `备份表 ${table} 的数据格式或行数不合法。` }, { status: 400 });
    }
  }
  const objects = backup.storageObjects === undefined ? [] : backup.storageObjects;
  if (!Array.isArray(objects) || objects.length > 5000) return NextResponse.json({ ok: false, error: "备份中的答题图片清单格式不合法。" }, { status: 400 });
  let totalBytes = 0;
  const preparedObjects: { bucket: "answer-images"; path: string; contentType: string; bytes: Buffer }[] = [];
  for (const object of objects) {
    const path = answerImagePath(`storage://answer-images/${String(object?.path || "")}`);
    if (object?.bucket !== "answer-images" || !path || typeof object?.dataBase64 !== "string" || typeof object?.contentType !== "string" || !/^image\/[a-zA-Z0-9.+-]+$/.test(object.contentType)) {
      return NextResponse.json({ ok: false, error: "备份中含有不支持或不安全的答题图片对象。" }, { status: 400 });
    }
    const bytes = Buffer.from(object.dataBase64, "base64");
    if (bytes.toString("base64") !== object.dataBase64) return NextResponse.json({ ok: false, error: `答题图片 ${path} 的编码无效。` }, { status: 400 });
    totalBytes += bytes.byteLength;
    if (totalBytes > 60 * 1024 * 1024) return NextResponse.json({ ok: false, error: "备份中的答题图片总量超过 60 MB。" }, { status: 413 });
    preparedObjects.push({ bucket: "answer-images", path, contentType: object.contentType, bytes });
  }

  const objectPaths = new Set(preparedObjects.map((object) => object.path));
  for (const row of backup.tables.answer_records as Record<string, any>[]) {
    if (typeof row.image_url === "string" && row.image_url.trim()) {
      const path = answerImagePath(row.image_url);
      if (!path || !objectPaths.has(path)) {
        return NextResponse.json({ ok: false, error: "备份中有答题图片引用，但没有包含图片文件本身；为避免恢复失效链接，已停止还原。请从原数据库重新导出完整备份。" }, { status: 400 });
      }
    }
    const path = answerImagePath(row.image_url);
    // Normalize only when the backup carries the actual object bytes.
    if (path && objectPaths.has(path)) row.image_url = answerImageRef(path);
  }

  const sb = getSupabaseAdmin();
  const uploadedPaths: string[] = [];
  if (preparedObjects.length) {
    const { data: buckets, error: bucketsError } = await sb.storage.listBuckets();
    if (bucketsError) return NextResponse.json({ ok: false, error: `检查答题图片存储桶失败：${bucketsError.message}` }, { status: 500 });
    if (!buckets?.some((bucket) => bucket.name === "answer-images")) {
      const { error } = await sb.storage.createBucket("answer-images", { public: false });
      if (error) return NextResponse.json({ ok: false, error: `创建私有答题图片存储桶失败：${error.message}` }, { status: 500 });
    }
    for (const object of preparedObjects) {
      const { data: existing, error: existingError } = await sb.storage.from(object.bucket).download(object.path);
      if (existing) {
        const currentBytes = Buffer.from(await existing.arrayBuffer());
        if (!currentBytes.equals(object.bytes)) {
          await sb.storage.from(object.bucket).remove(uploadedPaths);
          return NextResponse.json({ ok: false, error: `目标数据库已有不同内容的答题图片 ${object.path}，已停止恢复。` }, { status: 409 });
        }
        continue;
      }
      const statusCode = String((existingError as any)?.statusCode || "");
      if (existingError && statusCode !== "404" && !/not found|object not found/i.test(existingError.message)) {
        await sb.storage.from(object.bucket).remove(uploadedPaths);
        return NextResponse.json({ ok: false, error: `检查答题图片 ${object.path} 失败：${existingError.message}` }, { status: 500 });
      }
      const { error } = await sb.storage.from(object.bucket).upload(object.path, object.bytes, { contentType: object.contentType, upsert: false });
      if (error) {
        await sb.storage.from(object.bucket).remove(uploadedPaths);
        return NextResponse.json({ ok: false, error: `恢复答题图片 ${object.path} 失败：${error.message}` }, { status: 500 });
      }
      uploadedPaths.push(object.path);
    }
  }

  const { data, error } = await sb.rpc("study_bank_restore_backup", { p_backup: backup });
  if (error) {
    if (uploadedPaths.length) await sb.storage.from("answer-images").remove(uploadedPaths);
    const missing = error.code === "42883" || /function .*study_bank_restore_backup.* does not exist/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "备份还原功能不可用，请确认已按 README.md 应用对应迁移。" : error.message }, { status: missing ? 503 : 409 });
  }
  return NextResponse.json({ ok: true, result: data });
}
