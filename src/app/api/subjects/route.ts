import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// POST: 创建科目
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description } = body as { name: string; description?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "科目名称不能为空" }, { status: 400 });
    }
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("subjects")
      .insert({ name: name.trim(), description: description || null })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ subject: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建科目失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 删除科目（级联删除章节、小节、知识点、题目）
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("subjects").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
