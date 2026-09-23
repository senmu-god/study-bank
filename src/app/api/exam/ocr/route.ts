import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// POST /api/exam/ocr
// 只负责：上传图片到 Storage + OCR 识别文字，不写答题记录。
// 前端拿到 ocrText 后合并进用户答案，统一由 /api/exam/submit 判分写库。
// body: { imageBase64 }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;
    if (!imageBase64) {
      return NextResponse.json({ error: "缺少图片" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 1. 上传图片
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    const fileName = `answer-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    // 确保 bucket 存在
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.find((b) => b.name === "answer-images")) {
      await sb.storage.createBucket("answer-images", { public: false });
    }

    const { error: upErr } = await sb.storage
      .from("answer-images")
      .upload(fileName, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw new Error("上传图片失败: " + upErr.message);

    // 生成签名 URL（2小时有效）
    const { data: signed } = await sb.storage
      .from("answer-images")
      .createSignedUrl(fileName, 7200);
    const imageUrl = signed?.signedUrl || "";

    // 2. OCR
    let ocrText = "";
    try {
      const ocrKey = process.env.OCR_SPACE_API_KEY || "K88243707888957";
      const ocrForm = new FormData();
      ocrForm.append("base64Image", imageBase64);
      ocrForm.append("language", "chs");
      ocrForm.append("isOverlayRequired", "false");
      ocrForm.append("scale", "true");
      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { apikey: ocrKey },
        body: ocrForm,
      });
      const ocrJson = await ocrRes.json();
      ocrText = ocrJson?.ParsedResults?.[0]?.ParsedText || "";
    } catch (e) {
      // OCR 失败不阻断，返回空文本让用户手输
      ocrText = "";
    }

    return NextResponse.json({ imageUrl, ocrText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片识别失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}