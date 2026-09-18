import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Difficulty } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * PUT 批量更新知识点：{ ids: string[], content?, difficulty?, tags? }
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { ids, content, difficulty, tags } = body as {
      ids: string[];
      content?: string;
      difficulty?: Difficulty;
      tags?: string[];
    };
    if (!ids || ids.length === 0) return NextResponse.json({ error: "未选择知识点" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (content) patch.content = content;
    if (difficulty) patch.difficulty = difficulty;
    if (tags !== undefined) patch.tags = tags;

    const sb = getSupabaseAdmin();
    const { error } = await sb.from("knowledge_points").update(patch).in("id", ids);
    if (error) throw error;
    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
