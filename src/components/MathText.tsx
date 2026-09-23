"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// 常见 LaTeX 命令列表，用于检测裸公式
const LATEX_CMD = /\\(frac|ln|sin|cos|tan|cot|sec|csc|lim|int|sum|prod|sqrt|log|pi|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|to|sim|approx|cdot|times|div|pm|mp|infty|Delta|angle|because|therefore|forall|exists|in|subset|cup|cap|mathbb|mathcal|text|left|right|begin|end|overrightarrow|overline|underline|hat|bar|vec|prime|circ|degree|triangle|parallel|perp|cong|equiv|propto|notin|subsetneq|supset|supsetneq|bigcup|bigcap|oint|iiint|iint|limsup|liminf|max|min|exp|sinh|cosh|tanh|arcsin|arccos|arctan|operatorname|displaystyle|nonumber|label|ref|tag|gathered|aligned|matrix|pmatrix|bmatrix|vmatrix|cases|frac|dfrac|tfrac|sqrt|root|over|under|brace|brack|choose|atop|stackrel|overset|underset|boxed|color|text|mbox|mathrm|mathbf|mathit|mathsf|mathtt|mathcal|mathbb|mathfrak|mathscr)/;

function normalizeMath(text: string): string {
  let s = text;

  // 1) \( ... \) -> $ ... $
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
  // 2) \[ ... \] -> $ ... $
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$${inner.trim()}$`);

  // 3) align 降级为 aligned
  s = s.replace(/\\begin\{align\}/g, "\\begin{aligned}").replace(/\\end\{align\}/g, "\\end{aligned}");
  // 剥离 \newcommand / \require / \def
  s = s.replace(/\\(?:newcommand|renewcommand|require|def)\{[^}]*\}[^\n]*/g, "");

  // 4) 扫描裸 LaTeX 命令，把周围的数学片段包进 $...$
  //    已经在 $...$ 里的不重复处理
  const chars = Array.from(s);
  const out: string[] = [];
  let i = 0;
  let inDollar = false;

  while (i < chars.length) {
    const ch = chars[i];

    // 追踪 $ 状态
    if (ch === "$") {
      out.push(ch);
      inDollar = !inDollar;
      i++;
      continue;
    }

    // 在 $ 里的内容原样输出
    if (inDollar) {
      out.push(ch);
      i++;
      continue;
    }

    // 检测到 LaTeX 命令开始
    if (ch === "\\" && i + 1 < chars.length && /[a-zA-Z]/.test(chars[i + 1])) {
      // 检查是不是已知的 LaTeX 命令
      const rest = chars.slice(i).join("");
      if (LATEX_CMD.test(rest)) {
        // 向左扩展：收集数学字符
        let start = i;
        while (start > 0 && isMathChar(chars[start - 1])) {
          start--;
        }
        // 向右扩展：收集数学字符
        let end = i;
        while (end < chars.length - 1 && isMathChar(chars[end + 1])) {
          end++;
        }
        // 提取数学片段
        const math = chars.slice(start, end + 1).join("");
        // 跳过空的或太短的
        if (math.trim().length > 1) {
          out.push("$", math.trim(), "$");
          i = end + 1;
          continue;
        }
      }
    }

    out.push(ch);
    i++;
  }
  s = out.join("");

  // 5) 折叠 $$
  s = s.replace(/\$\$/g, "$");

  // 6) 奇数个 $：转义多余的（不删除，避免吞货币符号）
  const dollarCount = (s.match(/\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
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

  // 7) 清理残留的孤立 \( \)
  s = s.replace(/\\\(/g, "").replace(/\\\)/g, "");

  return s;
}

// 判断是否是数学字符（拉丁字母、数字、运算符、括号等）
function isMathChar(c: string): boolean {
  if (!c) return false;
  // 中文字符不是数学字符
  if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(c)) return false;
  // 常见数学字符
  if (/[a-zA-Z0-9]/.test(c)) return true;
  if (/[=+\-*/^_()[\]{}.,<>!|%\\]/.test(c)) return true;
  if (c === " " || c === "\t") return true;
  return false;
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