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

      <div className="space-y-2">
        {loading && <p className="text-sm text-muted-foreground">加载中…</p>}
        {items.map((q) => (
          <Card key={q.id} className="cursor-pointer hover:border-primary/40" onClick={() => openDetail(q)}>
            <CardContent className="p-3 text-sm">
              <div className="flex items-start gap-2">
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
    </div>
  );
}
