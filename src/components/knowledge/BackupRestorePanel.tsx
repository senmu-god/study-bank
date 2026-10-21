"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Database, Loader2 } from "lucide-react";

type RestoreResult = { inserted?: number; policy?: string; per_table?: Record<string, number> };

export default function BackupRestorePanel() {
  const [backup, setBackup] = useState<any>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [busy, setBusy] = useState(false);
  const rowCount = useMemo(() => Object.values(backup?.tables || {}).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0), [backup]);
  const imageCount = Array.isArray(backup?.storageObjects) ? backup.storageObjects.length : 0;

  async function load(file?: File) {
    setError(""); setResult(null); setBackup(null);
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { setError("文件超过 100 MB。"); return; }
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 2 || !parsed?.tables || typeof parsed.tables !== "object") throw new Error("仅支持本站导出的 study-bank v2 完整备份。");
      const core = ["subjects", "chapters", "sections", "knowledge_points", "questions", "papers", "paper_questions", "answer_records", "wrong_answers", "mock_exam_analyses"];
      const missing = core.find((table) => !Array.isArray(parsed.tables[table]));
      if (missing) throw new Error(`备份缺少核心数据表：${missing}`);
      setBackup(parsed); setFileName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "无法读取备份文件。"); }
  }

  async function restore() {
    if (!backup || !window.confirm(`将以单次事务合并还原约 ${rowCount} 行数据。相同主键的现有行会保留，不覆盖当前内容；发生关联或格式错误时整批回滚。继续？`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/data/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(backup) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "还原失败");
      setResult(payload.result);
    } catch (e) { setError(e instanceof Error ? e.message : "还原失败。"); }
    finally { setBusy(false); }
  }

  return <section className="glass rounded-2xl p-4">
    <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Database size={15} /></span><h2 className="text-[13.5px] font-semibold">完整备份还原</h2></div>
    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">选择本站导出的完整备份。数据库行以单次事务合并，不覆盖现有数据；答题图片会先恢复到私有存储桶，若数据库还原失败则清理本次新上传的图片。</p>
    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/70 px-3 py-2 text-[12px] font-medium hover:bg-white"><Database size={14} />选择 study-bank JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void load(event.target.files?.[0])} /></label>
    {fileName && <span className="ml-2 text-[11px] text-muted-foreground">{fileName}</span>}
    {backup && <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-[11.5px] text-muted-foreground">备份版本 v2 · {Object.keys(backup.tables).length} 张数据表 · {rowCount} 行 · {imageCount} 张答题图片</span><button disabled={busy} onClick={() => void restore()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-medium text-primary-foreground disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}确认合并还原</button></div>}
    {error && <div className="mt-3 flex gap-2 rounded-xl bg-[#f2688c]/10 p-2.5 text-[11.5px] text-[#a32349]"><AlertTriangle size={14} className="shrink-0" />{error}</div>}
    {result && <div className="mt-3 rounded-xl bg-[#2fe0c0]/10 p-2.5 text-[11.5px] text-[#087763]">还原完成：新增 {result.inserted || 0} 行。相同主键的现有数据均已保留。</div>}
  </section>;
}
