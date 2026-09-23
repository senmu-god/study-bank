import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// POST /api/exam/upload-image
// 只负责上传图片到 Storage，返回签名 URL。不做 OCR，不写答题记录。
// body: { imageBase64 }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;
    if (!imageBase64) {
      return NextResponse.json({ error: "缺少图片" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    const fileName = `answer-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.find((b) => b.name === "answer-images")) {
      await sb.storage.createBucket("answer-images", { public: false });
    }

    const { error: upErr } = await sb.storage
      .from("answer-images")
      .upload(fileName, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error("上传图片失败: " + upErr.message);

    const { data: signed } = await sb.storage
      .from("answer-images")
      .createSignedUrl(fileName, 7200);

    return NextResponse.json({ imageUrl: signed?.signedUrl || "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}