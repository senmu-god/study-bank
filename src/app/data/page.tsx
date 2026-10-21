"use client";

import Link from "next/link";
import { Download, Database, ShieldCheck, AlertTriangle } from "lucide-react";
import { useOverview } from "@/lib/useOverview";
import { KP_STATUS, KP_STATUS_ORDER } from "@/lib/kpStatus";
import LegacyImportPanel from "@/components/knowledge/LegacyImportPanel";
import BackupRestorePanel from "@/components/knowledge/BackupRestorePanel";

export default function DataPage() {
  const { data, error, loading } = useOverview();

  if (error) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{error}</div>;
  }
  if (loading || !data) {
    return (
      <div className="glass flex h-[50vh] items-center justify-center rounded-2xl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
    );
  }

  const rows = [...data.chapters].sort((a, b) => b.supplement - a.supplement);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[22px] font-bold leading-tight">数据管理</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          题库覆盖报告、备份与数据库状态
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="知识点" value={data.totals.kps} unit="个" />
        <Metric label="题目" value={data.totals.questions} unit="道" />
        <Metric label="有题知识点" value={data.totals.covered} unit={`/ ${data.totals.kps}`} />
        <Metric
          label="题库覆盖率"
          value={((data.totals.covered / Math.max(1, data.totals.kps)) * 100).toFixed(1)}
          unit="%"
        />
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <h2 className="text-[13.5px] font-semibold">题库覆盖报告</h2>
          <span className="text-[11.5px] text-muted-foreground">按缺口排序</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">章节</th>
                <th className="px-3 py-2 text-right font-medium">知识点</th>
                <th className="px-3 py-2 text-right font-medium">题目</th>
                <th className="px-3 py-2 text-right font-medium">有题知识点</th>
                <th className="px-3 py-2 font-medium">覆盖率</th>
                <th className="px-3 py-2 text-right font-medium">重要性</th>
                <th className="px-3 py-2 text-right font-medium">补题优先级</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const pct = c.coverage.total ? (c.coverage.covered / c.coverage.total) * 100 : 0;
                return (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.name}</div>
                      <div className="mt-0.5 flex gap-1">
                        {KP_STATUS_ORDER.filter((s) => c.counts[s] > 0).map((s) => (
                          <span
                            key={s}
                            className="num rounded px-1 text-[10px]"
                            style={{
                              background: KP_STATUS[s].soft,
                              color: KP_STATUS[s].ink,
                            }}
                            title={KP_STATUS[s].label}
                          >
                            {c.counts[s]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">{c.leafCount}</td>
                    <td className="num px-3 py-2 text-right">{c.questionCount}</td>
                    <td className="num px-3 py-2 text-right">
                      {c.coverage.covered} / {c.coverage.total}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[rgba(120,145,200,.16)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background:
                                pct === 0
                                  ? "#f2688c"
                                  : pct < 50
                                  ? "#f0b445"
                                  : "linear-gradient(90deg,#4f6bff,#22d3ee)",
                            }}
                          />
                        </div>
                        <span className="num text-[11.5px] text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {(c.weight * 100).toFixed(0)}%
                    </td>
                    <td className="num px-3 py-2 text-right">
                      <span
                        className="rounded px-1.5 py-0.5"
                        style={{
                          background:
                            c.supplement > 0.15 ? "rgba(242,104,140,.12)" : "transparent",
                          color: c.supplement > 0.15 ? "#c22a55" : "inherit",
                        }}
                      >
                        {(c.supplement * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download size={15} />
            </span>
            <h2 className="text-[13.5px] font-semibold">完整数据备份</h2>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            导出全部数据库表与答题图片，包含知识点、题目、状态、证据和学习记录。
            备份文件不包含任何密钥（密钥只存在于服务端环境变量中）；图片总量上限为 60 MB。
          </p>
          <a
            href="/api/export/all"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-[12.5px] font-medium text-primary-foreground"
          >
            <Download size={13} /> 下载备份
          </a>
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database size={15} />
            </span>
            <h2 className="text-[13.5px] font-semibold">数据库状态</h2>
          </div>
          <ul className="mt-2.5 space-y-1.5 text-[12px]">
            <StatusLine ok={data.schemaReady} label="知识点状态表 kp_state" />
            <StatusLine ok={data.detailReady} label="知识点内容表 kp_detail" />
            <StatusLine ok={data.weightReady} label="章节权重表 chapter_weights" />
            <StatusLine ok={data.recordsReady} label="学习记录表 kp_records" />
            <StatusLine ok={data.testsReady} label="专项测试表 kp_tests" />
            <StatusLine ok={data.notesReady} label="笔记表 kp_notes" />
            <StatusLine ok={data.teachingReady} label="互动教学表 teaching_sessions" />
          </ul>
          {!data.schemaReady && (
            <div className="mt-2.5 flex gap-2 rounded-xl bg-[#f0b445]/10 p-2.5 text-[11.5px] leading-relaxed text-[#8a5f00]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                当前数据库缺少知识状态表，知识状态无法持久化。请先备份数据，再按 README.md 中的数据库初始化步骤核对并应用迁移。
              </span>
            </div>
          )}
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
            知识状态迁移就绪后，确认其他功能表也显示就绪；迁移文件与顺序见 README.md。
          </p>
        </div>
      </div>

      <LegacyImportPanel data={data} />
      <BackupRestorePanel />

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <ShieldCheck size={16} className="text-primary" />
        <p className="flex-1 text-[12px] leading-relaxed text-muted-foreground">
          建议每周导出一次备份。Supabase 免费版不提供自动备份，且 7 天不活动会暂停项目。
        </p>
        <Link
          href="/questions"
          className="rounded-xl border border-border bg-white/70 px-3 py-1.5 text-[12px] font-medium text-foreground/80 hover:bg-white"
        >
          查看题库
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="num text-[22px] font-bold leading-none">{value}</span>
        {unit && <span className="text-[11.5px] text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: ok ? "#2fe0c0" : "#f0b445" }}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto text-[11px] ${ok ? "text-[#0d8f76]" : "text-[#a4700c]"}`}>
        {ok ? "就绪" : "未创建"}
      </span>
    </li>
  );
}
