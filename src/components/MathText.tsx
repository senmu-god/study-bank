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
  // 5) 如果 $ 总数是奇数，说明有未闭合的公式。
  //    不要删除 $（会吞掉货币符号如 $500），而是把多余的那个 $ 转义成 \$，
  //    让它在 markdown 里显示为字面量 $。
  const dollarCount = (s.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    // 找到最后一个未配对的 $，转义它
    let seen = 0;
    let lastOdd = -1;
    for (let j = 0; j < s.length; j++) {
      if (s[j] === "$") {
        seen++;
        if (seen % 2 === 1) lastOdd = j;
      }
    }
    if (lastOdd >= 0) {
      s = s.slice(0, lastOdd) + "\\$" + s.slice(lastOdd + 1);
    }
  }
  // 6) 清理残留的孤立 \( 和 \)（AI 少写一半时）
  s = s.replace(/\\\(/g, "").replace(/\\\)/g, "");
  // 7) align 环境在行内模式不支持，降级为 aligned
  s = s.replace(/\\begin\{align\}/g, "\\begin{aligned}").replace(/\\end\{align\}/g, "\\end{aligned}");
  // 8) 剥离 \newcommand / \require / \def 等定义命令
  s = s.replace(/\\(?:newcommand|renewcommand|require|def)\{[^}]*\}[^\n]*/g, "");
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