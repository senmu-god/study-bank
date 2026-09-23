"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * remark-math 只认 $...$。
 * AI 经常混用 \(...\)、\[...\]、普通 (...)、$$ 等，这里统一清洗。
 */
function normalizeMath(text: string): string {
  let s = text;
  // 1) \( ... \) -> $ ... $
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
  // 2) \[ ... \] -> $ ... $  （统一用行内，不用独立公式）
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$${inner.trim()}$`);
  // 3) 普通 ( ... ) 内含 \命令 的，转成 $ ... $
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
  s = out.join("");
  // 4) AI 经常把 $ 写成 $$（多打一个），统一折叠成单个 $
  s = s.replace(/\$\$/g, "$");
  // 5) 如果 $ 总数是奇数，说明有未闭合的公式，去掉最后一个 $（避免残留字面量）
  const dollarCount = (s.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    const lastIdx = s.lastIndexOf("$");
    if (lastIdx >= 0) {
      s = s.slice(0, lastIdx) + s.slice(lastIdx + 1);
    }
  }
  return s;
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
