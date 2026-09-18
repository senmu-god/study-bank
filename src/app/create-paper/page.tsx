"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/controls";
import type { SubjectNode, QuestionType } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";

const TYPE_KEYS: QuestionType[] = ["single_choice", "multiple_choice", "fill_blank", "true_false", "short_answer"];

export default function CreatePaperPage() {
  const router = useRouter();
  const [tree, setTree] = useState<SubjectNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(24);
  const [difficulty, setDifficulty] = useState("mixed");
  const [ratios, setRatios] = useState<Record<QuestionType, number>>({
    single_choice: 40, multiple_choice: 10, fill_blank: 20, true_false: 15, short_answer: 15,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/knowledge/tree").then((r) => r.json()).then((d) => setTree(d.tree || []));
  }, []);

  function toggleKp(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    // 均匀分配
    const per = next.size > 0 ? Math.floor(100 / next.size) : 0;
    const p: Record<string, number> = {};
    next.forEach((k) => (p[k] = per));
    setPercent(p);
  }

  const sum = Object.values(percent).reduce((a, b) => a + (b || 0), 0);

  async function create() {
    setError("");
    if (selected.size === 0) { setError("请至少选择一个知识点"); return; }
    if (sum !== 100) { setError(`知识点百分比之和必须为 100%，当前为 ${sum}%`); return; }
    setCreating(true);
    const r = await fetch("/api/papers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalQuestions: total,
        kpConfig: [...selected].map((k) => ({ kpId: k, percentage: percent[k] })),
        typeRatios: ratios,
        difficultyRange: difficulty,
        paperType: "daily",
      }),
    });
    const d = await r.json();
    setCreating(false);
    if (d.error) { setError(d.error); return; }
    router.push(`/paper/${d.paperId}/preview`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">组卷</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>选择知识点</CardTitle></CardHeader>
          <CardContent className="max-h-[60vh] space-y-3 overflow-auto text-sm">
            {tree.map((s) =>
              s.chapters.map((c) =>
                c.sections.map((sec) => (
                  <div key={sec.id} className="ml-2">
                    <div className="text-muted-foreground">{s.name} / {c.name} / {sec.name}</div>
                    <div className="ml-4 space-y-1">
                      {sec.kps.map((k) => (
                        <label key={k.id} className="flex items-center gap-2">
                          <input type="checkbox" checked={selected.has(k.id)} onChange={() => toggleKp(k.id)} />
                          <span className="flex-1">{k.content}</span>
                          {selected.has(k.id) && (
                            <Input
                              type="number"
                              className="h-7 w-16 text-xs"
                              value={percent[k.id] || 0}
                              onChange={(e) => setPercent({ ...percent, [k.id]: Number(e.target.value) })}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="mb-1 text-sm font-medium">知识点占比合计：{sum}%</div>
                <div className={sum === 100 ? "text-xs text-primary" : "text-xs text-destructive"}>
                  {sum === 100 ? "校验通过" : "必须等于 100%"}
                </div>
              </div>
              <label className="text-sm">总题数</label>
              <Input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
              <label className="text-sm">整卷难度</label>
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="mixed">混合</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>题型比例（%）</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {TYPE_KEYS.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <span className="w-24">{QUESTION_TYPE_LABELS[t]}</span>
                  <Input
                    type="number"
                    value={ratios[t]}
                    onChange={(e) => setRatios({ ...ratios, [t]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </CardContent>
          </Card>

          <Button className="w-full" onClick={create} disabled={creating || sum !== 100}>
            {creating ? "生成中…" : "生成考卷"}
          </Button>
        </div>
      </div>
    </div>
  );
}
