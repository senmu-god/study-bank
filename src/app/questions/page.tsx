"use client";

import { useEffect, useState } from "react";
import { Eye, Pencil, X, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Input, Textarea, Select } from "@/components/ui/controls";
import type { Question, QuestionType, Difficulty } from "@/lib/types";
import { QUESTION_TYPE_LABELS, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from "@/lib/types";
import { formatDateTime, cn } from "@/lib/utils";

function DiffBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.medium)}>
      {DIFFICULTY_LABELS[difficulty] || "中等"}
    </span>
  );
}

type QWithKp = Question & {
  knowledge_points: {
    content: string;
    sections: { name: string; chapters: { name: string; subjects: { name: string } } } | null;
  } | null;
};

export default function QuestionsPage() {
  const [items, setItems] = useState<QWithKp[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [detail, setDetail] = useState<QWithKp | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<QWithKp>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(p = page) {
    setLoading(true);
    const r = await fetch(`/api/questions/list?page=${p}`);
    const d = await r.json();
    setItems(d.items || []);
    setTotal(d.total || 0);
    setTotalPages(d.totalPages || 1);
    setPage(p);
    setLoading(false);
  }
  useEffect(() => { load(1); }, []);

  const allChecked = items.length > 0 && items.every((q) => selectedIds.has(q.id));
  function toggleAll() {
    if (allChecked) {
      const next = new Set(selectedIds);
      items.forEach((q) => next.delete(q.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      items.forEach((q) => next.add(q.id));
      setSelectedIds(next);
    }
  }
  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  async function doDeleteSelected() {
    setBusy(true);
    const r = await fetch("/api/questions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionIds: [...selectedIds] }),
    });
    const d = await r.json();
    setBusy(false);
    setShowDeleteConfirm(false);
    if (d.error) { alert("删除失败：" + d.error); return; }
    alert(`已删除 ${d.deleted} 道题目`);
    setSelectedIds(new Set());
    load();
  }

  async function doClear() {
    setBusy(true);
    const r = await fetch("/api/questions/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "确认清空" }),
    });
    const d = await r.json();
    setBusy(false);
    setShowClearConfirm(false);
    setClearInput("");
    if (d.error) { alert("清空失败：" + d.error); return; }
    alert(`已清空题库，共删除 ${d.cleared} 道题目`);
    setSelectedIds(new Set());
    load(1);
  }

  function openDetail(q: QWithKp) {
    setDetail(q);
    setEditing(false);
    setEditForm({ ...q });
  }

  async function saveEdit() {
    if (!detail || !editForm.id) return;
    const r = await fetch("/api/questions/update", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editForm.id,
        question_text: editForm.question_text,
        options: editForm.options,
        correct_answer: editForm.correct_answer,
        explanation: editForm.explanation,
        difficulty: editForm.difficulty,
      }),
    });
    const d = await r.json();
    if (d.error) { alert("保存失败：" + d.error); return; }
    setDetail(null);
    setEditing(false);
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">题库（{total} 题）</h1>

      {/* 操作栏 */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          全选本页
        </label>
        <span className="text-sm text-muted-foreground">已选 {selectedIds.size} 题</span>
        <div className="flex-1" />
        <Button
          variant="outline"
          disabled={selectedIds.size === 0 || busy}
          onClick={() => setShowDeleteConfirm(true)}
        >
          删除选中（{selectedIds.size}）
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => setShowClearConfirm(true)}>
          清空题库
        </Button>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {items.map((q) => (
          <Card key={q.id} className="cursor-pointer hover:border-primary/40" onClick={() => openDetail(q)}>
            <CardContent className="p-3 text-sm">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.id)}
                  onChange={() => toggleOne(q.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                />
                <Badge variant="secondary">{QUESTION_TYPE_LABELS[q.question_type]}</Badge>
                <DiffBadge difficulty={q.difficulty} />
                <span className="flex-1 line-clamp-2">{q.question_text}</span>
                <Eye size={14} className="text-muted-foreground shrink-0 mt-1" />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {q.knowledge_points?.content || ""} · {formatDateTime(q.generated_at)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>下一页</Button>
        </div>
      )}

      {/* 详情/编辑弹窗 */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-lg bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">题目详情</h2>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>

            {!editing ? (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <Badge variant="secondary">{QUESTION_TYPE_LABELS[detail.question_type]}</Badge>
                  <DiffBadge difficulty={detail.difficulty} />
                </div>
                <p className="whitespace-pre-wrap font-medium">{detail.question_text}</p>
                {detail.options && detail.options.length > 0 && (
                  <div className="space-y-1">
                    {detail.options.map((opt) => (
                      <div key={opt.label} className={cn("p-2 rounded", opt.label === detail.correct_answer && "bg-green-50 dark:bg-green-950/30")}>
                        <span className="font-medium">{opt.label}.</span> {opt.text}
                      </div>
                    ))}
                  </div>
                )}
                <div><span className="text-muted-foreground">正确答案：</span><span className="font-medium text-green-600">{detail.correct_answer}</span></div>
                <div><span className="text-muted-foreground">解析：</span><span className="whitespace-pre-wrap">{detail.explanation}</span></div>
                <div className="text-xs text-muted-foreground">知识点：{detail.knowledge_points?.content}</div>
                <Button onClick={() => setEditing(true)}><Pencil size={14} /> 编辑</Button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <label className="text-xs text-muted-foreground">题干</label>
                  <Textarea value={editForm.question_text || ""} onChange={(e) => setEditForm({ ...editForm, question_text: e.target.value })} />
                </div>
                {editForm.options && editForm.options.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">选项</label>
                    {editForm.options.map((opt, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <span className="w-6 font-medium">{opt.label}.</span>
                        <Input value={opt.text} onChange={(e) => {
                          const newOpts = [...(editForm.options || [])];
                          newOpts[i] = { ...opt, text: e.target.value };
                          setEditForm({ ...editForm, options: newOpts });
                        }} />
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground">正确答案</label>
                  <Input value={editForm.correct_answer || ""} onChange={(e) => setEditForm({ ...editForm, correct_answer: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">解析</label>
                  <Textarea value={editForm.explanation || ""} onChange={(e) => setEditForm({ ...editForm, explanation: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">难度</label>
                  <Select value={editForm.difficulty || "medium"} onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value as Difficulty })}>
                    <option value="easy">容易</option>
                    <option value="medium_easy">较易</option>
                    <option value="medium">中等</option>
                    <option value="hard">较难</option>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveEdit}><Save size={14} /> 保存</Button>
                  <Button variant="outline" onClick={() => { setEditing(false); setEditForm({ ...detail }); }}>取消</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* 删除选中确认 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">确认删除</h2>
            <p className="mt-2 text-sm text-muted-foreground">将删除勾选的 <span className="font-bold text-red-500">{selectedIds.size}</span> 道题目，且不可恢复。是否继续？</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
              <Button variant="destructive" onClick={doDeleteSelected} disabled={busy}>{busy ? "删除中…" : "确认删除"}</Button>
            </div>
          </div>
        </div>
      )}

      {/* 清空题库严格确认 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowClearConfirm(false)}>
          <div className="w-full max-w-md rounded-lg bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-red-500">危险操作：清空整个题库</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              将永久删除全部 <span className="font-bold">{total}</span> 道题目，且不可恢复。请在下方输入 <span className="font-bold text-red-500">确认清空</span> 四字以继续。
            </p>
            <Input value={clearInput} onChange={(e) => setClearInput(e.target.value)} placeholder="输入：确认清空" className="mt-3" />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowClearConfirm(false)}>取消</Button>
              <Button variant="destructive" onClick={doClear} disabled={clearInput !== "确认清空" || busy}>
                {busy ? "清空中…" : "永久清空"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
