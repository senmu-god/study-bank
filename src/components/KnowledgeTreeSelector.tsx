"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/controls";

interface SubjectNode {
  id: string;
  name: string;
  chapters: {
    id: string;
    name: string;
    sections: {
      id: string;
      name: string;
      kps: { id: string; content: string; source_date: string }[];
    }[];
  }[];
}

interface Props {
  tree: SubjectNode[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
}

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

export default function KnowledgeTreeSelector({ tree, checked, onChange }: Props) {
  const [subjectFilter, setSubjectFilter] = useState<Set<string>>(new Set()); // 空=全选
  const [kw, setKw] = useState("");
  const [debouncedKw, setDebouncedKw] = useState("");

  // 防抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKw(kw.trim()), 300);
    return () => clearTimeout(t);
  }, [kw]);

  // 收集所有 kpId
  const allKpIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of tree) for (const c of s.chapters) for (const sec of c.sections) for (const kp of sec.kps) ids.push(kp.id);
    return ids;
  }, [tree]);

  function toggleKp(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }
  function toggleAll(ids: string[], check: boolean) {
    const next = new Set(checked);
    for (const id of ids) check ? next.add(id) : next.delete(id);
    onChange(next);
  }

  // 双条件过滤：先科目，再关键词
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
                // 如果有关键词，section 命中或其子 kp 命中
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

  // 当前过滤后可见的 kp 总数
  const visibleKpIds = useMemo(() => {
    const ids: string[] = [];
    for (const s of filtered) if (s) for (const c of s.chapters) for (const sec of c.sections) for (const kp of sec.kps) ids.push(kp.id);
    return ids;
  }, [filtered]);

  return (
    <div className="space-y-3">
      {/* 科目 Tabs */}
      <div className="flex flex-wrap gap-1">
        {tree.map((s) => {
          const active = subjectFilter.size === 0 || subjectFilter.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                setSubjectFilter((prev) => {
                  const next = new Set(prev);
                  if (next.size === 0) {
                    next.add(s.id);
                  } else if (next.has(s.id)) {
                    next.delete(s.id);
                  } else {
                    next.add(s.id);
                  }
                  return next;
                });
              }}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {active && "✓ "}{s.name}
            </button>
          );
        })}
        {subjectFilter.size > 0 && (
          <button
            onClick={() => setSubjectFilter(new Set())}
            className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground hover:bg-primary/20"
          >
            显示全部
          </button>
        )}
      </div>

      {/* 搜索 + 快捷操作 */}
      <div className="flex gap-2">
        <Input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="搜索知识点关键词（防抖300ms）"
          className="flex-1"
        />
        <Button size="sm" variant="outline" onClick={() => toggleAll(visibleKpIds, true)}>全选结果</Button>
        <Button size="sm" variant="outline" onClick={() => toggleAll(visibleKpIds, false)}>清空结果</Button>
      </div>

      {/* 树形（自动展开过滤后所有节点） */}
      <div className="max-h-80 overflow-auto space-y-2 text-sm">
        {filtered.map((s) => {
          if (!s) return null;
          const sIds = s.chapters.flatMap((c) => c.sections.flatMap((sec) => sec.kps.map((k) => k.id)));
          const sChecked = sIds.length > 0 && sIds.every((id) => checked.has(id));
          return (
            <div key={s.id}>
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={sChecked} onChange={(e) => toggleAll(sIds, e.target.checked)} />
                {highlight(s.name, debouncedKw)}
              </label>
              <div className="ml-5 space-y-1">
                {s.chapters.map((c) => {
                  const cIds = c.sections.flatMap((sec) => sec.kps.map((k) => k.id));
                  const cChecked = cIds.length > 0 && cIds.every((id) => checked.has(id));
                  return (
                    <div key={c.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={cChecked} onChange={(e) => toggleAll(cIds, e.target.checked)} />
                        {highlight(c.name, debouncedKw)}
                      </label>
                      <div className="ml-5 space-y-0.5">
                        {c.sections.map((sec) => {
                          const secIds = sec.kps.map((k) => k.id);
                          const secChecked = secIds.length > 0 && secIds.every((id) => checked.has(id));
                          return (
                            <div key={sec.id}>
                              <label className="flex items-center gap-2 text-muted-foreground">
                                <input type="checkbox" checked={secChecked} onChange={(e) => toggleAll(secIds, e.target.checked)} />
                                {highlight(sec.name, debouncedKw)}
                              </label>
                              <div className="ml-5 space-y-0.5">
                                {sec.kps.map((kp) => (
                                  <label key={kp.id} className="flex items-center gap-2">
                                    <input type="checkbox" checked={checked.has(kp.id)} onChange={() => toggleKp(kp.id)} />
                                    <span>{highlight(kp.content, debouncedKw)}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">无匹配结果</p>}
      </div>
    </div>
  );
}
