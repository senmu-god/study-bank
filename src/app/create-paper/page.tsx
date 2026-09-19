"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/controls";
import type { SubjectNode, QuestionType } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/types";

const TYPE_KEYS: QuestionType[] = ["single_choice", "multiple_choice", "fill_blank", "true_false", "short_answer", "design"];

function highlight(text: string, kw: string) {
  if (!kw) return text;
  const idx = text.toLowerCase().indexOf(kw.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200">{text.slice(idx, idx + kw.length)}</mark>
      {text.slice(idx + kw.length)}
    </>
  );
}

export default function CreatePaperPage() {
  const router = useRouter();
  const [tree, setTree] = useState<SubjectNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(24);
  const [difficulty, setDifficulty] = useState("mixed");
  const [ratios, setRatios] = useState<Record<QuestionType, number>>({
    single_choice: 40, multiple_choice: 10, fill_blank: 20, true_false: 15, short_answer: 15, design: 0,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [subjectFilter, setSubjectFilter] = useState<Set<string>>(new Set());
  const [kw, setKw] = useState("");
  const [debouncedKw, setDebouncedKw] = useState("");

  useEffect(() => {
    fetch("/api/knowledge/tree").then((r) => r.json()).then((d) => setTree(d.tree || []));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedKw(kw.trim()), 300);
    return () => clearTimeout(t);
  }, [kw]);

  function toggleKp(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    const per = next.size > 0 ? Math.floor(100 / next.size) : 0;
    const p: Record<string, number> = {};
    next.forEach((k) => (p[k] = per));
    setPercent(p);
  }

  function toggleAllKps(ids: string[], check: boolean) {
    const next = new Set(selected);
    for (const id of ids) check ? next.add(id) : next.delete(id);
    setSelected(next);
    const per = next.size > 0 ? Math.floor(100 / next.size) : 0;
    const p: Record<string, number> = {};
    next.forEach((k) => (p[k] = per));
    setPercent(p);
  }

  const filtered = useMemo(() => {
    const kwLower = debouncedKw.toLowerCase();
    return tree
      .filter((s) => subjectFilter.size === 0 || subjectFilter.has(s.id))
      .map((s) => {
        const chapters = s.chapters
          .map((c) => {
            const sections = c.sections
              .map((sec) => {
                const kps = sec.kps.filter((kp) => {
                  if (!kwLower) return true;
                  return (
                    kp.content.toLowerCase().includes(kwLower) ||
                    sec.name.toLowerCase().includes(kwLower) ||
                    c.name.toLowerCase().includes(kwLower) ||
                    s.name.toLowerCase().includes(kwLower)
                  );
                });
                if (kwLower && kps.length === 0 && !sec.name.toLowerCase().includes(kwLower)) return null;
                return { ...sec, kps };
              })
              .filter(Boolean);
            if (kwLower && sections.length === 0 && !c.name.toLowerCase().includes(kwLower)) return null;
            return { ...c, sections: sections as NonNullable<typeof sections[number]>[] };
          })
          .filter(Boolean);
        if (kwLower && chapters.length === 0 && !s.name.toLowerCase().includes(kwLower)) return null;
        return { ...s, chapters: chapters as NonNullable<typeof chapters[number]>[] };
      })
      .filter(Boolean);
  }, [tree, subjectFilter, debouncedKw]);

  const visibleKpIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of filtered) if (s) for (const c of s.chapters) for (const sec of c.sections) for (const kp of sec.kps) ids.push(kp.id);
    return ids;
  }, [filtered]);

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
          <CardHeader><CardTitle>选择知识点（已选 {selected.size} 个）</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-1">
              {tree.map((s) => {
                const active = subjectFilter.size === 0 || subjectFilter.has(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSubjectFilter((prev) => {
                        const next = new Set(prev);
                        if (next.size === 0) next.add(s.id);
                        else if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                    className={`rounded-full px-3 py-1 text-xs ${
                      active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {active && "✓ "}{s.name}
                  </button>
                );
              })}
              {subjectFilter.size > 0 && (
                <button onClick={() => setSubjectFilter(new Set())} className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  显示全部
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="搜索知识点关键词" className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => toggleAllKps(visibleKpIds, true)}>全选结果</Button>
              <Button size="sm" variant="outline" onClick={() => toggleAllKps(visibleKpIds, false)}>清空结果</Button>
            </div>

            <div className="max-h-[50vh] space-y-3 overflow-auto text-sm">
              {filtered.map((s) =>
                s && s.chapters.map((c) =>
                  c.sections.map((sec) => (
                    <div key={sec.id} className="ml-2">
                      <div className="text-muted-foreground">
                        {highlight(s.name, debouncedKw)} / {highlight(c.name, debouncedKw)} / {highlight(sec.name, debouncedKw)}
                      </div>
                      <div className="ml-4 space-y-1">
                        {sec.kps.map((k) => (
                          <label key={k.id} className="flex items-center gap-2">
                            <input type="checkbox" checked={selected.has(k.id)} onChange={() => toggleKp(k.id)} />
                            <span className="flex-1">{highlight(k.content, debouncedKw)}</span>
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
              {filtered.length === 0 && <p className="text-xs text-muted-foreground">无匹配结果</p>}
            </div>
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
                <option value="mixed">混合（容易30/较易30/中等30/较难10）</option>
                <option value="easy">容易</option>
                <option value="medium_easy">较易</option>
                <option value="medium">中等</option>
                <option value="hard">较难</option>
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
