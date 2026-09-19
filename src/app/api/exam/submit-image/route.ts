import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { gradeShortAnswer } from "@/lib/deepseek";

export const dynamic = "force-dynamic";

// POST /api/exam/submit-image
// 接收图片 base64，上传到 Supabase Storage，OCR 识别文字，调用 DeepSeek 判分
// body: { paperId, questionId, imageBase64, userAnswer?, questionText, correctAnswer }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { paperId, questionId, imageBase64, userAnswer, questionText, correctAnswer } = body;
    if (!paperId || !questionId || !imageBase64) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // 1. 上传图片到 Supabase Storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(base64Data, "base64");
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { data: upData, error: upErr } = await sb.storage
      .from("answer-images")
      .upload(fileName, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      // bucket 可能不存在，尝试创建
      await sb.storage.createBucket("answer-images", { public: true });
      const r2 = await sb.storage.from("answer-images").upload(fileName, buf, { contentType: "image/jpeg", upsert: false });
      if (r2.error) throw new Error("上传图片失败: " + r2.error.message);
    }
    const { data: pubUrl } = sb.storage.from("answer-images").getPublicUrl(fileName);
    const imageUrl = pubUrl.publicUrl;

    // 2. OCR：调用 OCR.space 免费 API
    let ocrText = "";
    try {
      const ocrForm = new FormData();
      ocrForm.append("base64Image", imageBase64);
      ocrForm.append("language", "chs");
      ocrForm.append("isOverlayRequired", "false");
      ocrForm.append("scale", "true");
      const ocrRes = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        headers: { apikey: "K88243707888957" }, // free demo key
        body: ocrForm,
      });
      const ocrJson = await ocrRes.json();
      ocrText = ocrJson?.ParsedResults?.[0]?.ParsedText || "";
    } catch (e) {
      ocrText = "";
    }

    // 3. 合并用户输入文本和 OCR 文本
    const studentText = [userAnswer, ocrText].filter(Boolean).join("\n");

    // 4. 调用 DeepSeek 判分
    const g = await gradeShortAnswer({
      questionText: questionText || "",
      correctAnswer: correctAnswer || "",
      userAnswer: studentText || "",
    });

    const isCorrect = g.score >= 60;

    // 5. 写入 answer_records
    const { error: insErr } = await sb.from("answer_records").insert({
      paper_id: paperId,
      question_id: questionId,
      user_answer: studentText || null,
      is_correct: isCorrect,
      image_url: imageUrl,
      ocr_text: ocrText,
      time_spent_seconds: 0,
    });
    if (insErr) throw new Error("写入答题记录失败: " + insErr.message);

    return NextResponse.json({
      isCorrect,
      score: g.score,
      comment: g.comment,
      ocrText,
      imageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "图片判分失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
