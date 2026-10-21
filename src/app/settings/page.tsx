"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Cpu, Database, ShieldCheck, AlertTriangle, Check, CalendarClock } from "lucide-react";

interface Status {
  ok: boolean;
  ai: { configured: boolean; model: string };
  access: { passwordConfigured: boolean; passwordLength: number };
  db: { reachable: boolean; schemaReady: boolean; error: string | null };
}
interface LearningSettings { daily_limit: number; retest_days: number; review_days: number }

export default function SettingsPage() {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState("");
  const [learning, setLearning] = useState<LearningSettings>({ daily_limit: 12, retest_days: 7, review_days: 3 });
  const [learningReady, setLearningReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [learningMessage, setLearningMessage] = useState("");

  useEffect(() => {
    fetch("/api/system/status")
      .then((r) => r.json())
      .then((d: Status) => {
        if (!d.ok) throw new Error("状态读取失败");
        setS(d);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "状态读取失败"));
    fetch("/api/settings/learning").then((r) => r.json()).then((d) => {
      if (d.ok) { setLearning(d.settings); setLearningReady(true); }
      else setLearningMessage(d.error || "学习设置表尚未创建");
    }).catch(() => setLearningMessage("学习设置读取失败"));
  }, []);

  async function saveLearning(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setLearningMessage("");
    try {
      const response = await fetch("/api/settings/learning", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(learning) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");
      setLearning(result.settings); setLearningMessage("学习设置已保存。");
    } catch (e) { setLearningMessage(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  }

  if (err) {
    return <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{err}</div>;
  }
  if (!s) {
    return (
      <div className="glass flex h-[50vh] items-center justify-center rounded-2xl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[22px] font-bold leading-tight">设置</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          访问保护、AI 服务与数据库状态（只读展示，不显示任何密钥）
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card icon={<CalendarClock size={15} />} title="学习计划" desc="调整每日任务数量，以及待确认测试和已掌握复习的间隔。">
          <form onSubmit={(event) => void saveLearning(event)} className="space-y-2">
            <NumberSetting label="每日任务上限" value={learning.daily_limit} min={1} max={50} onChange={(value) => setLearning((x) => ({ ...x, daily_limit: value }))} />
            <NumberSetting label="待确认复测间隔（天）" value={learning.retest_days} min={1} max={90} onChange={(value) => setLearning((x) => ({ ...x, retest_days: value }))} />
            <NumberSetting label="已掌握复习间隔（天）" value={learning.review_days} min={1} max={60} onChange={(value) => setLearning((x) => ({ ...x, review_days: value }))} />
            <button disabled={!learningReady || saving} className="rounded-xl bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-50">{saving ? "保存中…" : "保存学习设置"}</button>
            {learningMessage && <p className="text-[11px] text-muted-foreground">{learningMessage}</p>}
          </form>
        </Card>
        <Card
          icon={<ShieldCheck size={15} />}
          title="访问保护"
          desc="整站由中间件统一拦截，未登录的页面请求跳转到登录页，接口请求返回 401。"
        >
          <Row
            label="站点密码"
            ok={s.access.passwordConfigured}
            text={
              s.access.passwordConfigured
                ? `已配置（${s.access.passwordLength} 位）`
                : "未配置 —— 生产环境将拒绝访问"
            }
          />
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            修改方式：在部署平台更新环境变量{" "}
            <code className="rounded bg-secondary px-1">SITE_ACCESS_PASSWORD</code> 并重新部署。
            密码只存在于服务端，浏览器仅持有签名后的会话 cookie。
          </p>
        </Card>

        <Card
          icon={<Cpu size={15} />}
          title="AI 服务"
          desc="DeepSeek 只由服务端调用，密钥不进入前端构建产物，也不写入数据库。"
        >
          <Row
            label="API 密钥"
            ok={s.ai.configured}
            text={s.ai.configured ? "已配置（服务端环境变量）" : "未配置，AI 功能不可用"}
          />
          <Row label="模型" ok text={s.ai.model} />
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            密钥保存在{" "}
            <code className="rounded bg-secondary px-1">DEEPSEEK_API_KEY</code>，界面不提供写入入口。
          </p>
        </Card>

        <Card
          icon={<Database size={15} />}
          title="数据库"
          desc="Supabase Postgres，全部通过服务端 service_role 访问。"
        >
          <Row label="连接" ok={s.db.reachable} text={s.db.reachable ? "正常" : s.db.error || "不可达"} />
          <Row
            label="知识漏洞表"
            ok={s.db.schemaReady}
            text={s.db.schemaReady ? "已创建" : "未创建，状态不会持久化"}
          />
          {!s.db.schemaReady && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#f0b445]/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-[#8a5f00]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                在 Supabase SQL Editor 执行{" "}
                <code className="rounded bg-white/60 px-1">supabase/migrations/20261021123746_kp_loop.sql</code>{" "}
                后刷新本页。
              </span>
            </div>
          )}
        </Card>

        <Card
          icon={<KeyRound size={15} />}
          title="数据与备份"
          desc="免费版 Supabase 无自动备份，需要手动导出。"
        >
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/export/all"
              className="rounded-xl bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground"
            >
              下载完整备份
            </a>
            <Link
              href="/data"
              className="rounded-xl border border-border bg-white/70 px-3 py-1.5 text-[12px] font-medium text-foreground/80"
            >
              覆盖报告
            </Link>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
            备份包含全部业务表，不包含密钥。回滚脚本位于{" "}
            <code className="rounded bg-secondary px-1">supabase/rollback/0002_kp_loop_rollback.sql</code>。
          </p>
        </Card>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{desc}</p>
      <div className="mt-2.5 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
        style={{ background: ok ? "rgba(47,224,192,.18)" : "rgba(240,180,69,.18)" }}
      >
        {ok ? (
          <Check size={10} className="text-[#0d8f76]" />
        ) : (
          <AlertTriangle size={10} className="text-[#a4700c]" />
        )}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto text-right ${ok ? "text-foreground/80" : "text-[#a4700c]"}`}>
        {text}
      </span>
    </div>
  );
}

function NumberSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="flex items-center gap-2 text-[12px]"><span className="flex-1 text-muted-foreground">{label}</span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-20 rounded-lg border border-border bg-white px-2 py-1.5 text-right" /></label>;
}
