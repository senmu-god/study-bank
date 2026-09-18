import { NextResponse } from "next/server";
import { parseImportText, buildPreviewTree } from "@/lib/parsers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { mode, text } = body as { mode: "markup" | "path" | "json"; text: string };
    if (!text) return NextResponse.json({ error: "内容为空" }, { status: 400 });
    const items = parseImportText(mode, text);
    if (items.length === 0) {
      return NextResponse.json({ error: "未解析到有效知识点，请检查格式" }, { status: 400 });
    }
    return NextResponse.json({ items, tree: buildPreviewTree(items), count: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
