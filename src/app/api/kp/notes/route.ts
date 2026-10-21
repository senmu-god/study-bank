import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(error: { code?: string; message: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|does not exist/i.test(error.message);
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20);
  if (typeof value === "string") return [...new Set(value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
  return [];
}

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data: notes, error } = await sb
    .from("kp_notes")
    .select("id,kp_id,question_id,title,body,tags,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: unavailable(error) ? "笔记表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。" : error.message },
      { status: unavailable(error) ? 503 : 500 }
    );
  }

  const kpIds = [...new Set((notes || []).flatMap((note) => note.kp_id ? [note.kp_id] : []))];
  const questionIds = [...new Set((notes || []).flatMap((note) => note.question_id ? [note.question_id] : []))];
  const [concepts, questions] = await Promise.all([
    kpIds.length ? sb.from("knowledge_points").select("id,content").in("id", kpIds) : Promise.resolve({ data: [], error: null }),
    questionIds.length ? sb.from("questions").select("id,question_text").in("id", questionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (concepts.error || questions.error) {
    const readError = concepts.error || questions.error;
    return NextResponse.json({ ok: false, error: readError?.message || "关联内容读取失败" }, { status: 500 });
  }
  const kpNames = new Map((concepts.data || []).map((kp) => [kp.id, kp.content]));
  const questionNames = new Map((questions.data || []).map((question) => [question.id, question.question_text]));
  return NextResponse.json({
    ok: true,
    notes: (notes || []).map((note) => ({
      ...note,
      knowledge_point: note.kp_id ? kpNames.get(note.kp_id) || "（知识点已删除）" : null,
      question: note.question_id ? questionNames.get(note.question_id) || "（题目已删除）" : null,
    })),
  });
}

async function saveNote(req: Request, editing: boolean) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "请求格式错误" }, { status: 400 });
  }
  const id = String(body?.id || "");
  const kpId = body?.kpId ? String(body.kpId) : null;
  const questionId = body?.questionId ? String(body.questionId) : null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = typeof body?.body === "string" ? body.body.trim().slice(0, 20000) : "";

  if (editing && !UUID.test(id)) return NextResponse.json({ ok: false, error: "笔记 id 不合法" }, { status: 400 });
  if (kpId && !UUID.test(kpId)) return NextResponse.json({ ok: false, error: "知识点 id 不合法" }, { status: 400 });
  if (questionId && !UUID.test(questionId)) return NextResponse.json({ ok: false, error: "题目 id 不合法" }, { status: 400 });
  if (!title || !content) return NextResponse.json({ ok: false, error: "标题和笔记内容不能为空" }, { status: 400 });

  const sb = getSupabaseAdmin();
  const values = {
    kp_id: kpId,
    question_id: questionId,
    title,
    body: content,
    tags: parseTags(body?.tags),
    updated_at: new Date().toISOString(),
  };
  const result = editing
    ? await sb.from("kp_notes").update(values).eq("id", id).select("id,kp_id,question_id,title,body,tags,created_at,updated_at").maybeSingle()
    : await sb.from("kp_notes").insert(values).select("id,kp_id,question_id,title,body,tags,created_at,updated_at").single();

  if (result.error) {
    const message = unavailable(result.error)
      ? "笔记表尚未创建，请按 README.md 中的迁移步骤启用知识漏洞模块。"
      : result.error.code === "23503"
        ? "关联的知识点或题目不存在，请刷新后重试。"
        : result.error.message;
    return NextResponse.json({ ok: false, error: message }, { status: unavailable(result.error) ? 503 : 500 });
  }
  if (!result.data) return NextResponse.json({ ok: false, error: "笔记不存在或已被移除" }, { status: 404 });
  return NextResponse.json({ ok: true, note: result.data });
}

export async function POST(req: Request) {
  return saveNote(req, false);
}

export async function PATCH(req: Request) {
  return saveNote(req, true);
}
