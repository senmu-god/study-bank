"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { Badge } from "@/components/ui/controls";
import type { ParsedImportItem } from "@/lib/types";

type Mode = "markup" | "path" | "json";

const PLACEHOLDER: Record<Mode, string> = {
  markup: "# 数学\n## 微积分\n### 极限\n- 极限的定义\n- 极限的性质\n- 极限的运算法则",
  path: "数学 > 微积分 > 极限 > 极限的定义\n数学 > 微积分 > 极限 > 极限的性质",
  json: '[\n  { "subject": "数学", "chapter": "微积分", "section": "极限", "content": "极限的定义", "tags": ["高频"] }\n]',
};

export default function ImportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("markup");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ items: ParsedImportItem[]; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function previewImport() {
    setLoading(true);
    setMsg("");
    const r = await fetch("/api/knowledge/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, text }),
    });
    const d = await r.json();
    if (d.error) setMsg(d.error);
    else setPreview(d);
    setLoading(false);
  }

  async function confirmImport() {
    setLoading(true);
    const r = await fetch("/api/knowledge/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: preview?.items }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.error) setMsg(d.error);
    else {
      setMsg(`成功导入 ${d.imported} 个知识点`);
      setPreview(null);
      setText("");
      setTimeout(() => router.push("/knowledge"), 800);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">批量导入知识点</h1>

      <Card>
        <CardHeader>
          <div className="flex gap-2">
            {(["markup", "path", "json"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setPreview(null); }}
                className={
                  m === mode
                    ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                    : "rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground"
                }
              >
                {m === "markup" ? "层级标记" : m === "path" ? "路径分隔" : "JSON 导入"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER[mode]}
            className="font-mono text-xs"
            rows={12}
          />
          <div className="flex gap-2">
            <Button onClick={previewImport} disabled={loading}>预览</Button>
            {preview && (
              <Button onClick={confirmImport} disabled={loading} variant="default">
                确认导入（{preview.count} 个）
              </Button>
            )}
          </div>
          {msg && <p className="text-sm text-primary">{msg}</p>}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle>导入预览（{preview.count} 个知识点）</CardTitle></CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-1 overflow-auto text-sm">
              {preview.items.slice(0, 100).map((it, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{it.subject}</Badge>
                  <span className="text-muted-foreground">{it.chapter} / {it.section}</span>
                  <span>· {it.content}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
