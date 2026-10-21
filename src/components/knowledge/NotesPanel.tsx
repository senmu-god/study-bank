"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookPlus, Save, X } from "lucide-react";

interface NoteRow {
  id: string;
  kp_id: string | null;
  question_id: string | null;
  title: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  knowledge_point: string | null;
  question: string | null;
}

interface Choice { id: string; label: string }

export function NotesPanel({ knowledgePoints }: { knowledgePoints: Choice[] }) {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [questions, setQuestions] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kpId, setKpId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [tags, setTags] = useState("");
  const [query, setQuery] = useState("");

  async function loadNotes(signal?: AbortSignal) {
    const response = await fetch("/api/kp/notes", { cache: "no-store", signal });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "笔记读取失败");
    setNotes(result.notes || []);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      loadNotes(controller.signal),
      fetch("/api/questions/list?page=1", { cache: "no-store", signal: controller.signal })
        .then((response) => response.json())
        .then((result) => setQuestions((result.items || []).map((question: { id: string; question_text: string }) => ({ id: question.id, label: question.question_text })))),
    ])
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "笔记读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((note) =>
      [note.title, note.body, note.knowledge_point || "", note.question || "", ...note.tags]
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [notes, query]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setKpId("");
    setQuestionId("");
    setTags("");
    setError("");
    setSaved(false);
  }

  function editNote(note: NoteRow) {
    setEditingId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setKpId(note.kp_id || "");
    setQuestionId(note.question_id || "");
    setTags(note.tags.join(", "));
    setError("");
    setSaved(false);
    document.getElementById("note-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/kp/notes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title, body, kpId: kpId || null, questionId: questionId || null, tags }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "保存笔记失败");
      await loadNotes();
      setSaved(true);
      setEditingId(null);
      setTitle("");
      setBody("");
      setKpId("");
      setQuestionId("");
      setTags("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存笔记失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <section className="space-y-2">
        <div className="glass flex items-center gap-2 rounded-xl p-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、内容、标签或关联项" className="min-w-0 flex-1 rounded-lg bg-white/70 px-3 py-2 text-[12.5px] outline-none focus:ring-1 focus:ring-primary/30" />
          <span className="px-2 text-[11.5px] text-muted-foreground">{filteredNotes.length} 条</span>
        </div>
        {error && !saved && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] text-rose-700">{error}</div>}
        {loading ? (
          <div className="glass rounded-2xl p-8 text-center text-[12.5px] text-muted-foreground">正在读取笔记…</div>
        ) : filteredNotes.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center text-[12.5px] text-muted-foreground">
            {notes.length ? "没有匹配的笔记。" : "还没有笔记。可以先创建一条，并关联知识点或题目。"}
          </div>
        ) : (
          filteredNotes.map((note) => (
            <article key={note.id} className="glass cursor-pointer rounded-xl px-3.5 py-3 transition hover:bg-white/85" onClick={() => editNote(note)}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{note.title}</h3>
                <time className="shrink-0 text-[10.5px] text-muted-foreground">
                  {new Date(note.updated_at).toLocaleDateString("zh-CN")}
                </time>
              </div>
              {(note.knowledge_point || note.question) && (
                <p className="mt-1 truncate text-[11px] text-primary/80">
                  {[note.knowledge_point, note.question ? `题目：${note.question}` : ""].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">{note.body}</p>
              {note.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{note.tags.map((tag) => <span key={tag} className="kp-chip">{tag}</span>)}</div>}
            </article>
          ))
        )}
      </section>

      <section id="note-editor" className="glass h-fit rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><BookPlus size={15} /></span>
            <h2 className="text-[13.5px] font-semibold">{editingId ? "编辑笔记" : "新建笔记"}</h2>
          </div>
          {editingId && <button type="button" onClick={resetForm} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white" aria-label="取消编辑"><X size={14} /></button>}
        </div>
        <form onSubmit={saveNote} className="space-y-2.5">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required placeholder="笔记标题" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] outline-none focus:border-primary/50" />
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} required rows={9} placeholder="记录知识摘要、公式、适用条件或易错点…" className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-[12.5px] leading-relaxed outline-none focus:border-primary/50" />
          <select value={kpId} onChange={(event) => setKpId(event.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px]">
            <option value="">不关联知识点</option>
            {knowledgePoints.map((kp) => <option key={kp.id} value={kp.id}>{kp.label}</option>)}
          </select>
          <select value={questionId} onChange={(event) => setQuestionId(event.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px]">
            <option value="">不关联题目</option>
            {questions.map((question) => <option key={question.id} value={question.id}>{question.label.slice(0, 100)}</option>)}
          </select>
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="标签，用逗号分隔" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-primary/50" />
          {error && <p role="alert" className="text-[11.5px] text-rose-700">{error}</p>}
          {saved && <p role="status" className="text-[11.5px] text-emerald-700">笔记已保存。</p>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground disabled:opacity-50">
            <Save size={13} /> {saving ? "正在保存…" : editingId ? "保存修改" : "保存笔记"}
          </button>
        </form>
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">笔记当前支持创建与修改，不提供直接删除入口，以免误删学习资料。</p>
      </section>
    </div>
  );
}
