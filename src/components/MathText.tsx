"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * remark-math 只认 $...$ / $$...$$。
 * AI 生成的公式有时用 \(...\)、\[...\] 或普通 (...) 包裹，这里统一转成 $。
 * 注意 markdown 里 \( 会被当转义括号，必须用 $。
 */
function normalizeMath(text: string): string {
  let s = text;
  // 1) \( ... \) -> $ ... $  （跨行不处理，按字符扫描）
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
  // 2) \[ ... \] -> $$ ... $$
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner.trim()}$$`);
  // 3) 普通 ( ... ) 内含 \命令 的，转成 $ ... $
  //    用扫描器处理嵌套括号和花括号
  const chars = Array.from(s);
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "(") {
      let depth = 1;
      let brace = 0;
      let k = i + 1;
      while (k < chars.length && depth > 0) {
        const c = chars[k];
        if (c === "{") brace++;
        else if (c === "}") brace--;
        else if (c === "(" && brace === 0) depth++;
        else if (c === ")" && brace === 0) depth--;
        if (depth === 0) break;
        k++;
      }
      if (depth === 0) {
        const inner = chars.slice(i + 1, k).join("");
        if (/\\[a-zA-Z]/.test(inner)) {
          out.push("$", inner.trim(), "$");
          i = k + 1;
          continue;
        }
      }
    }
    out.push(ch);
    i++;
  }
  return out.join("");
}

/** 渲染含 LaTeX 数学公式的文本 */
export default function MathText({ content }: { content: string }) {
  if (!content) return null;
  const normalized = normalizeMath(content);
  return (
    <div className="math-text">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
