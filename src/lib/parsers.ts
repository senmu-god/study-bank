import type { ParsedImportItem, Difficulty } from "./types";

function normalizeDifficulty(raw: unknown): Difficulty {
  const v = String(raw || "").toLowerCase();
  if (v === "easy" || v === "简单" || v === "易") return "easy";
  if (v === "hard" || v === "困难" || v === "难" || v === "难" ) return "hard";
  return "medium";
}

/**
 * 模式A：层级标记
 * # 科目 / ## 章节 / ### 小节 / - 知识点
 */
function parseMarkup(text: string): ParsedImportItem[] {
  const items: ParsedImportItem[] = [];
  let subject = "";
  let chapter = "";
  let section = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("### ")) {
      section = line.slice(4).trim();
    } else if (line.startsWith("## ")) {
      chapter = line.slice(3).trim();
      section = "";
    } else if (line.startsWith("# ")) {
      subject = line.slice(2).trim();
      chapter = "";
      section = "";
    } else if (line.startsWith("- ")) {
      const content = line.slice(2).trim();
      if (!subject || !chapter || !section || !content) continue;
      items.push({
        subject,
        chapter,
        section,
        content,
        difficulty: "medium",
        tags: [],
      });
    }
  }
  return items;
}

/**
 * 模式B：路径分隔  科目 > 章节 > 小节 > 知识点
 */
function parsePath(text: string): ParsedImportItem[] {
  const items: ParsedImportItem[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes(">")) continue;
    const parts = line.split(">").map((s) => s.trim()).filter(Boolean);
    if (parts.length < 4) continue;
    items.push({
      subject: parts[0],
      chapter: parts[1],
      section: parts[2],
      content: parts.slice(3).join(" > "),
      difficulty: "medium",
      tags: [],
    });
  }
  return items;
}

/**
 * 模式C：JSON 数组
 */
function parseJson(text: string): ParsedImportItem[] {
  const data = JSON.parse(text) as Array<Record<string, unknown>>;
  return data.map((row) => ({
    subject: String(row.subject || ""),
    chapter: String(row.chapter || ""),
    section: String(row.section || ""),
    content: String(row.content || ""),
    difficulty: normalizeDifficulty(row.difficulty),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }));
}

export function parseImportText(mode: "markup" | "path" | "json", text: string): ParsedImportItem[] {
  if (mode === "markup") return parseMarkup(text);
  if (mode === "path") return parsePath(text);
  return parseJson(text);
}

/** 把解析结果聚合成预览树 */
export function buildPreviewTree(items: ParsedImportItem[]) {
  const tree: Record<string, Record<string, Record<string, number>>> = {};
  for (const it of items) {
    tree[it.subject] ??= {};
    tree[it.subject][it.chapter] ??= {};
    tree[it.subject][it.chapter][it.section] =
      (tree[it.subject][it.chapter][it.section] || 0) + 1;
  }
  return tree;
}
