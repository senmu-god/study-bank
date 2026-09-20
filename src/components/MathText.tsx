"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** 渲染含 LaTeX 数学公式的文本（支持 \(...\)、\[...\] 与 $...$） */
export default function MathText({ content }: { content: string }) {
  if (!content) return null;
  return (
    <div className="math-text">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
