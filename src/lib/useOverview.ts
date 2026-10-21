"use client";

import { useCallback, useEffect, useState } from "react";
import type { KpStatus, StatusCounts } from "./kpStatus";

export interface OverviewLeaf {
  id: string;
  name: string;
  status: KpStatus;
  questionCount: number;
  difficulty: string;
  locked: boolean;
  lastStudiedAt: string | null;
}

export interface OverviewSection {
  id: string;
  name: string;
  order: number;
  progress: number;
  counts: StatusCounts;
  leaves: OverviewLeaf[];
}

export interface OverviewChapter {
  id: string;
  name: string;
  order: number;
  weight: number;
  weightParts: { core: number; centrality: number; gap: number };
  weightLocked: boolean;
  weightManual: number | null;
  progress: number;
  counts: StatusCounts;
  leafCount: number;
  questionCount: number;
  coverage: { covered: number; total: number };
  supplement: number;
  sections: OverviewSection[];
}

export interface OverviewData {
  ok: boolean;
  schemaReady: boolean;
  detailReady: boolean;
  weightReady: boolean;
  recordsReady: boolean;
  testsReady: boolean;
  notesReady: boolean;
  teachingReady: boolean;
  generatedAt: string;
  totals: {
    chapters: number;
    sections: number;
    kps: number;
    questions: number;
    covered: number;
    counts: StatusCounts;
    progress: number;
  };
  chapters: OverviewChapter[];
  suggestions: { chapterId: string; name: string; reason: string }[];
  error?: string;
}

let cache: OverviewData | null = null;

export function useOverview() {
  const [data, setData] = useState<OverviewData | null>(cache);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!cache);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // 首次命中缓存时直接复用，避免同一会话内重复拉取；
    // 状态变更后通过 reload() 递增 tick 强制刷新。
    if (cache && tick === 0) return;
    setLoading(true);
    fetch("/api/kp/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: OverviewData) => {
        if (!alive) return;
        if (!d.ok) throw new Error(d.error || "加载失败");
        cache = d;
        setData(d);
        setError("");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = useCallback(() => {
    cache = null;
    setTick((t) => t + 1);
  }, []);

  return { data, error, loading, reload };
}

export function clearOverviewCache() {
  cache = null;
}
