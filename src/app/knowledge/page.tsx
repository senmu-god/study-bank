"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Pencil, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Input, Select } from "@/components/ui/controls";
import type { SubjectNode, KnowledgePoint, Difficulty } from "@/lib/types";
import { DIFFICULTY_LABELS } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";

export default function KnowledgePage() {
  const [tree, setTree] = useState<SubjectNode[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [tagInputs, setTagInputs] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const r = await fetch("/api/knowledge/tree");
    const d = await r.json();
    setTree(d.tree || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const allKps = useMemo(() => {
    const list: (KnowledgePoint & { path: string })[] = [];
    for (const s of tree)
      for (const c of s.chapters)
        for (const sec of c.sections)
          for (const k of sec.kps) list.push({ ...k, path: `${s.name} / ${c.name} / ${sec.name}` });
    return list;
  }, [tree]);

  const visibleKps = useMemo(() => {
    return allKps.filter((k) => {
      if (tagFilter && !(k.tags || []).includes(tagFilter)) return false;
      // 按选中的科目/章节/小节过滤
      if (selectedSubject) {
        const s = tree.find((x) => x.id === selectedSubject);
        if (!s) return false;
        const kpPath = k.path;
        if (!kpPath.startsWith(s.name + " / ")) return false;
      }
      if (selectedChapter) {
        const c = tree.flatMap((s) => s.chapters).find((x) => x.id === selectedChapter);
        if (!c) return false;
        if (!k.path.includes(" / " + c.name + " / ")) return false;
      }
      if (selectedSection && !k.path.endsWith(" / " + selectedSection)) return false;
      return true;
    });
  }, [allKps, tagFilter, selectedSubject, selectedChapter, selectedSection, tree]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const k of allKps) (k.tags || []).forEach((t) => set.add(t));
    return [...set];
  }, [allKps]);

  async function delKp(id: string) {
    if (!confirm("确认删除该知识点？其下题目也会被删除。")) return;
    await fetch(`/api/knowledge/delete?id=${id}`, { method: "DELETE" });
    load();
  }

  async function delSubject(id: string, name: string) {
    if (!confirm(`确认删除科目"${name}"？将同时删除其下所有章节、小节、知识点和题目！`)) return;
    const r = await fetch(`/api/subjects?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (d.error) alert("删除失败：" + d.error);
    load();
  }

  async function addSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    const r = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (d.error) { alert("创建失败：" + d.error); return; }
    setNewSubjectName("");
    setShowAddSubject(false);
    load();
  }

  async function batchUpdate(patch: { difficulty?: Difficulty; tags?: string[] }) {
    await fetch("/api/knowledge/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], ...patch }),
    });
    setSelected(new Set());
    load();
  }

  async function addTagToKp(kpId: string) {
    const tag = (tagInputs[kpId] || "").trim();
    if (!tag) return;
    const kp = allKps.find((k) => k.id === kpId);
    if (!kp) return;
    const newTags = [...(kp.tags || []), tag];
    await fetch("/api/knowledge/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [kpId], tags: newTags }),
    });
    setTagInputs({ ...tagInputs, [kpId]: "" });
    load();
  }

  async function removeTagFromKp(kpId: string, tag: string) {
    const kp = allKps.find((k) => k.id === kpId);
    if (!kp) return;
    const newTags = (kp.tags || []).filter((t) => t !== tag);
    await fetch("/api/knowledge/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [kpId], tags: newTags }),
    });
    load();
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">知识点管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddSubject(true)}>
            <Plus size={16} /> 添加科目
          </Button>
          <Link href="/knowledge/import"><Button><Plus size={16} /> 批量导入</Button></Link>
        </div>
      </div>

      {showAddSubject && (
        <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
          <Input
            placeholder="科目名称，如：数学"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSubject()}
            className="w-60"
            autoFocus
          />
          <Button size="sm" onClick={addSubject}>确定</Button>
          <Button size="sm" variant="outline" onClick={() => { setShowAddSubject(false); setNewSubjectName(""); }}>取消</Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        {/* 左侧树 */}
        <Card className="h-fit">
          <CardContent className="max-h-[70vh] overflow-auto p-3 text-sm">
            {loading && <p className="text-muted-foreground">加载中…</p>}
            {tree.map((s) => (
              <div key={s.id}>
                <div className="flex items-center group">
                  <button
                    className="flex-1 flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-secondary"
                    onClick={() => {
                      setExpanded({ ...expanded, [s.id]: !expanded[s.id] });
                      setSelectedSubject(selectedSubject === s.id ? null : s.id);
                      setSelectedChapter(null);
                      setSelectedSection(null);
                    }}
                  >
                    <ChevronRight size={14} className={cn("transition-transform", expanded[s.id] && "rotate-90")} />
                    <span className={selectedSubject === s.id ? "text-primary" : ""}>{s.name}</span>
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
                    title="删除科目"
                    onClick={() => delSubject(s.id, s.name)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {expanded[s.id] &&
                  s.chapters.map((c) => (
                    <div key={c.id} className="ml-4">
                      <button
                        className="flex w-full items-center gap-1 rounded px-2 py-1 text-muted-foreground hover:bg-secondary"
                        onClick={() => {
                          setExpanded({ ...expanded, [c.id]: !expanded[c.id] });
                          setSelectedChapter(selectedChapter === c.id ? null : c.id);
                          setSelectedSection(null);
                        }}
                      >
                        <ChevronRight size={14} className={cn("transition-transform", expanded[c.id] && "rotate-90")} />
                        <span className={selectedChapter === c.id ? "text-primary" : ""}>{c.name}</span>
                      </button>
                      {expanded[c.id] &&
                        c.sections.map((sec) => (
                          <button
                            key={sec.id}
                            className={cn(
                              "ml-6 block w-full rounded px-2 py-1 text-left text-xs",
                              selectedSection === sec.name ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
                            )}
                            onClick={() => setSelectedSection(selectedSection === sec.name ? null : sec.name)}
                          >
                            {sec.name}（{sec.kps.length}）
                          </button>
                        ))}
                    </div>
                  ))}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 右侧列表 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {(selectedSubject || selectedChapter || selectedSection) && (
              <Button size="sm" variant="outline" onClick={() => { setSelectedSubject(null); setSelectedChapter(null); setSelectedSection(null); }}>
                显示全部
              </Button>
            )}
            <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="w-40">
              <option value="">全部标签</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            {selected.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">已选 {selected.size} 项</span>
                <Select
                  className="w-32"
                  defaultValue=""
                  onChange={(e) => e.target.value && batchUpdate({ difficulty: e.target.value as Difficulty })}
                >
                  <option value="">批量难度</option>
                  <option value="easy">简单</option>
                  <option value="medium">中等</option>
                  <option value="hard">困难</option>
                </Select>
                <Button size="sm" variant="outline" onClick={() => batchUpdate({ tags: ["高频"] })}>
                  打标签：高频
                </Button>
              </>
            )}
          </div>

          <div className="space-y-2">
            {visibleKps.map((k) => (
              <Card key={k.id}>
                <CardContent className="flex items-start gap-3 p-3 text-sm">
                  <input type="checkbox" checked={selected.has(k.id)} onChange={() => toggle(k.id)} />
                  <div className="flex-1">
                    <div className="font-medium">{k.content}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{k.path}</span>
                      <Badge variant="secondary">{DIFFICULTY_LABELS[k.difficulty]}</Badge>
                      {(k.tags || []).map((t) => (
                        <Badge key={t} className="flex items-center gap-1 pr-1">
                          {t}
                          <button onClick={() => removeTagFromKp(k.id, t)} className="hover:text-destructive">
                            <X size={10} />
                          </button>
                        </Badge>
                      ))}
                      <span>{formatDate(k.source_date)}</span>
                    </div>
                    {/* 行内标签输入 */}
                    <div className="mt-2 flex items-center gap-1">
                      <Input
                        placeholder="+ 标签（回车添加）"
                        value={tagInputs[k.id] || ""}
                        onChange={(e) => setTagInputs({ ...tagInputs, [k.id]: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && addTagToKp(k.id)}
                        className="h-7 w-40 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="text-muted-foreground hover:text-foreground" onClick={() => delKp(k.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {visibleKps.length === 0 && (
              <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">没有知识点，去批量导入吧</CardContent></Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
