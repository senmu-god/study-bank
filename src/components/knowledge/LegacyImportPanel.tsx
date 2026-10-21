"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import type { OverviewData } from "@/lib/useOverview";

type LegacyKp = { id: string; name: string; level: string; summary?: string; status?: string };
type Backup = { meta?: { app?: string }; knowledge: LegacyKp[]; evidence?: unknown[]; records?: unknown[]; questions?: unknown[] };
type Result = Record<string, unknown>;

const normalize = (value: string) => value.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "").toLocaleLowerCase();

export default function LegacyImportPanel({ data }: { data: OverviewData }) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [decided, setDecided] = useState<Record<string, boolean>>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = useMemo(() => data.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.leaves.map((leaf) => ({ ...leaf, sectionName: section.name, chapterName: chapter.name })))), [data]);
  const leaves = useMemo(() => (backup?.knowledge || []).filter((item) => item.level === "leaf" && item.id && item.name), [backup]);
  const mappedCount = Object.values(mappings).filter(Boolean).length;

  async function loadFile(file?: File) {
    setError(""); setResult(null); setBackup(null); setMappings({}); setSuggestions({}); setDecided({});
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("备份文件超过 8 MB，无法上传。"); return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed?.knowledge)) throw new Error("文件中没有知识点数据；请从「知识就是力量」的数据管理页导出 JSON 备份。");
      const valid = parsed.knowledge.filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && x.level === "leaf");
      if (!valid.length) throw new Error("备份中没有可映射的叶子知识点。");
      if (new Set(valid.map((item: LegacyKp) => item.id)).size !== valid.length) throw new Error("备份中存在重复的叶子知识点 ID，请先检查导出文件。");
      const next: Record<string, string> = {};
      const nextSuggestions: Record<string, string> = {};
      const legacyNameCounts = new Map<string, number>();
      for (const item of valid as LegacyKp[]) legacyNameCounts.set(normalize(item.name), (legacyNameCounts.get(normalize(item.name)) || 0) + 1);
      for (const item of valid as LegacyKp[]) {
        const matches = targets.filter((target) => normalize(target.name) === normalize(item.name));
        const duplicateLegacyName = (legacyNameCounts.get(normalize(item.name)) || 0) > 1;
        if (matches.length === 1 && !duplicateLegacyName) nextSuggestions[item.id] = matches[0].id;
      }
      setBackup(parsed); setMappings(next); setSuggestions(nextSuggestions); setDecided({}); setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "无法读取备份文件。"); }
  }

  async function importBackup() {
    if (!backup || !mappedCount || leaves.some((item) => !decided[item.id]) || !window.confirm(`将导入 ${mappedCount} 个明确映射的知识点及其记录。已有题库内容和已有状态会保留；旧系统题目仅保存为关联资料笔记。确认继续？`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/kp/import-legacy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: backup, mapping: Object.fromEntries(Object.entries(mappings).filter(([, id]) => id)) }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "导入失败");
      setResult(payload.result || {});
    } catch (e) { setError(e instanceof Error ? e.message : "导入失败。"); }
    finally { setBusy(false); }
  }

  const selectedTargets = new Set(Object.values(mappings).filter(Boolean));

  return <section className="glass rounded-2xl p-4">
    <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileUp size={15} /></span><h2 className="text-[13.5px] font-semibold">导入「知识就是力量」备份</h2></div>
    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">先在旧网站导出 JSON 备份，再逐项确认知识点映射。系统只按名称给出唯一精确匹配建议，不会自动创建知识点；旧题目作为资料笔记保存，不会进入考试题库。</p>
    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/70 px-3 py-2 text-[12px] font-medium hover:bg-white"><FileUp size={14} />选择 JSON 备份<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
    {fileName && <span className="ml-2 text-[11px] text-muted-foreground">{fileName}</span>}
    {backup && <>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground"><span>旧系统叶子知识点：{leaves.length}</span><span>已选择映射：{mappedCount}</span><span>待确认：{leaves.filter((item) => !decided[item.id]).length}</span><span>证据：{backup.evidence?.length || 0}</span><span>记录：{backup.records?.length || 0}</span><span>旧题资料：{backup.questions?.length || 0}</span></div>
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">{leaves.map((item) => <div key={item.id} className="grid gap-1.5 rounded-xl border border-border/70 bg-white/40 p-2.5 sm:grid-cols-[minmax(150px,1fr)_minmax(220px,1.2fr)] sm:items-center"><div className="min-w-0"><div className="truncate text-[12px] font-medium" title={item.name}>{item.name}</div><div className="text-[10px] text-muted-foreground">{item.id}</div>{suggestions[item.id] && !decided[item.id] && <div className="mt-1 text-[10px] text-primary">建议匹配：{targets.find((target) => target.id === suggestions[item.id])?.chapterName} / {targets.find((target) => target.id === suggestions[item.id])?.sectionName} / {item.name}（请选择确认）</div>}</div><select className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-[11.5px]" value={decided[item.id] ? mappings[item.id] || "" : ""} onChange={(event) => { const value = event.target.value; setMappings((current) => ({ ...current, [item.id]: value })); setDecided((current) => ({ ...current, [item.id]: true })); }}><option value="">明确跳过此知识点</option>{targets.map((target) => <option key={target.id} value={target.id} disabled={selectedTargets.has(target.id) && mappings[item.id] !== target.id}>{target.chapterName} / {target.sectionName} / {target.name}</option>)}</select></div>)}</div>
      <button disabled={!mappedCount || leaves.some((item) => !decided[item.id]) || busy} onClick={() => void importBackup()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}确认并导入 {mappedCount} 个映射</button>
    </>}
    {error && <div className="mt-3 flex gap-2 rounded-xl bg-[#f2688c]/10 p-2.5 text-[11.5px] text-[#a32349]"><AlertTriangle size={14} className="shrink-0" />{error}</div>}
    {result && <div className="mt-3 flex gap-2 rounded-xl bg-[#2fe0c0]/10 p-2.5 text-[11.5px] text-[#087763]"><CheckCircle2 size={14} className="shrink-0" /><span>{result.already_imported ? "这份备份已成功导入过，本次没有重复写入。" : "导入完成。"} 知识点 {String(result.mapped_concepts ?? 0)} 个；证据 {String(result.imported_evidence ?? 0)} 条；学习记录 {String(result.imported_records ?? 0)} 条；旧题资料笔记 {String(result.legacy_questions_as_notes ?? 0)} 条。未映射条目已跳过。</span></div>}
  </section>;
}
