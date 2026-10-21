import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// POST /api/exam/upload-image
// 只负责上传图片到私有 Storage，返回稳定对象路径。不做 OCR，不写答题记录。
// body: { imageBase64 }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;
    if (!imageBase64) {
      return NextResponse.json({ error: "缺少图片" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const match = String(imageBase64).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return NextResponse.json({ error: "图片格式仅支持 JPEG、PNG 或 WebP。" }, { status: 400 });
    const contentType = match[1].toLowerCase();
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const base64Data = match[2];
    const buf = Buffer.from(base64Data, "base64");
    if (!buf.byteLength || buf.byteLength > 3 * 1024 * 1024) return NextResponse.json({ error: "压缩后的答案图片必须小于 3 MB。" }, { status: 413 });
    const fileName = `answer-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.find((b) => b.name === "answer-images")) {
      await sb.storage.createBucket("answer-images", { public: false });
    }

    const { error: upErr } = await sb.storage
      .from("answer-images")
      .upload(fileName, buf, { contentType, upsert: false });
    if (upErr) throw new Error("上传图片失败: " + upErr.message);

    return NextResponse.json({ imagePath: fileName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
