"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KP_STATUS, KP_STATUS_ORDER, type KpStatus } from "@/lib/kpStatus";
import { buildLayout, type ChapterInput } from "@/lib/treeLayout";

/** 章节配色：只用于枝干区分，叶片颜色始终由掌握状态决定，两者不混用 */
const CHAPTER_COLORS = [
  "#4a7cff",
  "#22d3ee",
  "#8b5cf6",
  "#38bdf8",
  "#6366f1",
  "#2dd4bf",
  "#a78bfa",
  "#0ea5e9",
  "#7dd3fc",
  "#c084fc",
];

export interface TreeChapterData {  id: string;
  name: string;
  order: number;
  sections: {
    id: string;
    name: string;
    order: number;
    leaves: {
      id: string;
      name: string;
      status: KpStatus;
      questionCount: number;
      difficulty: string;
    }[];
  }[];
}

interface Props {
  chapters: TreeChapterData[];
  focusId: string | null;
  onFocus: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveKp: (kpId: string, sectionId: string) => void;
  activeStatuses: KpStatus[];
  onToggleStatus: (s: KpStatus) => void;
  onResetStatuses: () => void;
}

export function KnowledgeTree({
  chapters,
  focusId,
  onFocus,
  selectedId,
  onSelect,
  onMoveKp,
  activeStatuses,
  onToggleStatus,
  onResetStatuses,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 620 });
  const [view, setView] = useState({ k: 0.8, tx: 0, ty: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [draggingLeaf, setDraggingLeaf] = useState<string | null>(null);
  const [dropSection, setDropSection] = useState<string | null>(null);

  const layout = useMemo(
    () => buildLayout(chapters as ChapterInput[], focusId),
    [chapters, focusId]
  );

  // 容器尺寸
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { w, h } = size;
    const bb = layout.bbox;
    const k = Math.min(w / bb.w, h / bb.h) * 0.95;
    setView({
      k,
      tx: w / 2 - (bb.x + bb.w / 2) * k,
      ty: h / 2 - (bb.y + bb.h / 2) * k,
    });
  }, [size, layout.bbox]);

  // 布局或容器变化时自适应
  useEffect(() => {
    fit();
  }, [fit]);

  // 滚轮缩放（以光标为锚点）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k2 = Math.max(0.35, Math.min(3.2, v.k * (e.deltaY > 0 ? 0.9 : 1.11)));
        const ratio = k2 / v.k;
        return { k: k2, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest("[data-tree-leaf]")) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const onPointerUp = () => {
    dragRef.current.active = false;
    setDragging(false);
  };

  const zoomBy = (f: number) => {
    const { w, h } = size;
    setView((v) => {
      const k2 = Math.max(0.35, Math.min(3.2, v.k * f));
      const ratio = k2 / v.k;
      return { k: k2, tx: w / 2 - (w / 2 - v.tx) * ratio, ty: h / 2 - (h / 2 - v.ty) * ratio };
    });
  };

  const statusOn = (s: KpStatus) => activeStatuses.includes(s);

  const hoveredLeaf = hover ? layout.leaves.find((l) => l.id === hover.id) : null;

  return (
    <div className="relative h-full w-full">
      <div
        ref={wrapRef}
        className="stage h-full w-full rounded-2xl"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          onPointerUp();
          setHover(null);
        }}
      >
        <svg
          className={`tree-canvas relative z-10 h-full w-full ${dragging ? "dragging" : ""}`}
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          <defs>
            <linearGradient id="kt-trunk" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0d1636" />
              <stop offset="55%" stopColor="#26306e" />
              <stop offset="100%" stopColor="#4a3aa0" />
            </linearGradient>
            <linearGradient id="kt-branch" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#2b4bd0" />
              <stop offset="50%" stopColor="#4a7cff" />
              <stop offset="100%" stopColor="#2ee0e8" />
            </linearGradient>
            <linearGradient id="kt-twig" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#3f6bd8" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#7fe8ff" stopOpacity="0.55" />
            </linearGradient>
            <radialGradient id="kt-ground">
              <stop offset="0%" stopColor="#35d0ff" stopOpacity="0.5" />
              <stop offset="55%" stopColor="#2a6bff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1a3fa0" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="kt-canopy">
              <stop offset="0%" stopColor="#3f6dff" stopOpacity="0.16" />
              <stop offset="60%" stopColor="#5b3fd8" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#2a6bff" stopOpacity="0" />
            </radialGradient>
            <filter id="kt-soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            {/* 树冠环境光：让叶片区域有体积感，不参与交互 */}
            <ellipse
              cx={layout.bbox.x + layout.bbox.w / 2}
              cy={layout.bbox.y + layout.bbox.h * 0.42}
              rx={layout.bbox.w * 0.6}
              ry={layout.bbox.h * 0.48}
              fill="url(#kt-canopy)"
            />

            {/* 地面光晕 */}
            <ellipse cx="0" cy="150" rx="300" ry="46" fill="url(#kt-ground)" className="glow-pulse" />
            <ellipse cx="0" cy="146" rx="170" ry="20" fill="#2ec8ff" opacity="0.09" />

            {/* 根须 */}
            {layout.roots.map((r, i) => (
              <g key={`root-${i}`}>
                <path
                  d={r.d}
                  stroke="#2a4bb8"
                  strokeWidth={r.w}
                  fill="none"
                  opacity="0.45"
                  strokeLinecap="round"
                />
                <path
                  d={r.d}
                  stroke="#5fd8ff"
                  strokeWidth={r.w * 0.3}
                  fill="none"
                  opacity="0.5"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* 树干 */}
            <path d={layout.trunk} fill="url(#kt-trunk)" />
            <path
              d={layout.trunk}
              fill="none"
              stroke="#4f7cff"
              strokeWidth="1.1"
              opacity="0.5"
            />
            <path
              d={layout.trunkHighlight}
              stroke="#7fe8ff"
              strokeWidth="1.4"
              fill="none"
              opacity="0.45"
            />

            {/* 章节主干：按章节分色，便于在整棵树上一眼区分章节 */}
            {layout.chapters.map((ch, ci) => {
              const col = CHAPTER_COLORS[ci % CHAPTER_COLORS.length];
              return (
                <g key={ch.id} className="node-hit" onClick={() => onFocus(ch.id)}>
                  <path
                    d={ch.path}
                    stroke={col}
                    strokeWidth="9"
                    fill="none"
                    opacity="0.22"
                    strokeLinecap="round"
                    filter="url(#kt-soft)"
                  />
                  <path
                    d={ch.path}
                    stroke={col}
                    strokeWidth="4.2"
                    fill="none"
                    strokeLinecap="round"
                    opacity={0.92}
                  />
                  <circle cx={ch.x} cy={ch.y} r="10" fill="#16204a" />
                  <circle cx={ch.x} cy={ch.y} r="6.5" fill={col} opacity="0.9" />
                  <circle cx={ch.x} cy={ch.y} r="3" fill="#eaf6ff" />
                  <circle cx={ch.x} cy={ch.y} r="22" fill="transparent" />
                </g>
              );
            })}

            {/* 小节分枝 */}
            {layout.chapters.map((ch, ci) =>
              ch.sections.map((sec) => (
                <g
                  key={sec.id}
                  onDragOver={(event) => { if (draggingLeaf) { event.preventDefault(); setDropSection(sec.id); } }}
                  onDragLeave={() => setDropSection((current) => current === sec.id ? null : current)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const kpId = event.dataTransfer.getData("text/kp-id");
                    const sourceSectionId = event.dataTransfer.getData("text/source-section-id");
                    if (kpId && sourceSectionId !== sec.id) onMoveKp(kpId, sec.id);
                    setDraggingLeaf(null); setDropSection(null);
                  }}
                >
                  <path
                    d={sec.path}
                    stroke={CHAPTER_COLORS[ci % CHAPTER_COLORS.length]}
                    strokeWidth="2"
                    fill="none"
                    opacity="0.6"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={sec.x}
                    cy={sec.y}
                    r="3"
                    fill={CHAPTER_COLORS[ci % CHAPTER_COLORS.length]}
                    opacity="0.8"
                  />
                  <circle
                    cx={sec.x}
                    cy={sec.y}
                    r="20"
                    fill={dropSection === sec.id ? "rgba(255,255,255,.24)" : "transparent"}
                    stroke={dropSection === sec.id ? "#b9f5ff" : "transparent"}
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                </g>
              ))
            )}

            {/* 叶柄 */}
            {layout.chapters.map((ch, ci) =>
              ch.sections.map((sec) =>
                sec.leaves.map((leaf) => (
                  <path
                    key={`tw-${leaf.id}`}
                    d={leaf.twig}
                    stroke={CHAPTER_COLORS[ci % CHAPTER_COLORS.length]}
                    strokeWidth="1"
                    fill="none"
                    opacity={statusOn(leaf.status) ? 0.3 : 0.07}
                  />
                ))
              )
            )}

            {/* 叶片 */}
            {layout.leaves.map((leaf) => {
              const meta = KP_STATUS[leaf.status];
              const on = statusOn(leaf.status);
              const selected = selectedId === leaf.id;
              // LOD：无论缩放多少，屏幕上至少保持 2px 可见
              const screenR = Math.min(9, Math.max(2.1, leaf.r * view.k));
              const rr = screenR / view.k;
              return (
                <g
                  key={leaf.id}
                  className="node-hit"
                  opacity={on ? 1 : 0.12}
                  data-tree-leaf="true"
                  ref={(node) => { if (node) node.setAttribute("draggable", "true"); }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/kp-id", leaf.id);
                    event.dataTransfer.setData("text/source-section-id", leaf.sectionId);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingLeaf(leaf.id);
                  }}
                  onDragEnd={() => { setDraggingLeaf(null); setDropSection(null); }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(leaf.id);
                  }}
                  onPointerEnter={(e) => {
                    const rect = wrapRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({ id: leaf.id, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  onPointerLeave={() => setHover(null)}
                >
                  <circle cx={leaf.x} cy={leaf.y} r={rr * 2.6} fill={meta.color} opacity={0.15} />
                  <circle
                    cx={leaf.x}
                    cy={leaf.y}
                    r={rr}
                    fill={meta.color}
                    stroke={selected ? "#ffffff" : "transparent"}
                    strokeWidth={selected ? 1.4 / view.k : 0}
                  />
                  <circle cx={leaf.x} cy={leaf.y} r={rr * 2.2} fill="transparent" />
                  {leaf.showLabel && view.k >= 0.5 && (
                    <text
                      x={leaf.labelX}
                      y={leaf.labelY}
                      textAnchor={leaf.anchor}
                      fill={on ? "#cfe0ff" : "#6b7a99"}
                      fontSize={Math.min(12.5, Math.max(10, 11.5 * view.k)) / view.k}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {leaf.short}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 章节/小节标签（LOD：保持屏幕字号恒定） */}
            {layout.sectionLabels.map((l) => {
              const isChapter = l.id.startsWith("chapter-");
              // 小节标签只在逐层模式或放大后出现：
              // 47 个小节名在整棵树的缩放下必然互相压住，此时以叶片和悬停提示为准。
              if (!isChapter && layout.mode === "full" && view.k < 1.15) return null;
              const base = isChapter ? 12.5 : 11;
              const size =
                Math.min(base + 1.5, Math.max(isChapter ? 10.5 : 9.5, base * view.k)) / view.k;
              const text = isChapter && view.k >= 1.6 && l.full ? l.full : l.name;
              const chIdx = isChapter ? layout.chapters.findIndex((c) => l.id === `chapter-${c.id}`) : -1;
              return (
                <text
                  key={l.id}
                  x={l.x}
                  y={l.y}
                  textAnchor={l.anchor as "start" | "middle" | "end"}
                  fill={
                    isChapter && chIdx >= 0
                      ? CHAPTER_COLORS[chIdx % CHAPTER_COLORS.length]
                      : "#8fa8d4"
                  }
                  fontSize={size}
                  fontWeight={isChapter ? 600 : 400}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {text}
                </text>
              );
            })}

            {/* 逐层模式下的其它章节入口 */}
            {layout.stubs.map((s) => (
              <g
                key={s.id}
                className="node-hit"
                onClick={() => onFocus(s.id)}
                opacity={0.7}
              >
                <circle cx={s.x} cy={s.y} r="4.5" fill="#3c4c74" />
                <text
                  x={s.x}
                  y={s.y + 20}
                  textAnchor="middle"
                  fill="#7f92b8"
                  fontSize="10.5"
                  style={{ userSelect: "none" }}
                >
                  {s.name.replace(/^[一二三四五六七八九十]+、/, "")}
                </text>
              </g>
            ))}
          </g>
        </svg>

        {/* 悬停提示 */}
        {hoveredLeaf && (
          <div
            className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-white/15 bg-[#0b1230]/95 px-3 py-2 text-[12px] leading-relaxed text-[#dce9ff] shadow-xl backdrop-blur"
            style={{
              left: Math.min(hover!.x + 14, size.w - 270),
              top: Math.max(8, hover!.y - 10),
            }}
          >
            <div className="font-medium">{hoveredLeaf.name}</div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[#93a8cf]">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: KP_STATUS[hoveredLeaf.status].color }}
              />
              {KP_STATUS[hoveredLeaf.status].label}
              <span className="opacity-40">·</span>
              {hoveredLeaf.questionCount} 题
            </div>
          </div>
        )}

        {/* 图例 + 筛选 */}
        <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5">
          {KP_STATUS_ORDER.map((s) => {
            const meta = KP_STATUS[s];
            const on = statusOn(s);
            return (
              <button
                key={s}
                onClick={() => onToggleStatus(s)}
                className="rounded-full border px-2.5 py-1 text-[11px] transition"
                style={{
                  borderColor: on ? meta.color + "88" : "rgba(140,160,200,.2)",
                  background: on ? meta.color + "1f" : "rgba(12,18,44,.6)",
                  color: on ? "#e7f0ff" : "#6d7d9c",
                }}
                title={`${meta.label}：${meta.desc}`}
              >
                <span
                  className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                  style={{ background: on ? meta.color : "#4a5878" }}
                />
                {meta.short}
              </button>
            );
          })}
          {activeStatuses.length < KP_STATUS_ORDER.length && (
            <button
              onClick={onResetStatuses}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-[#93a8cf] hover:text-white"
            >
              全部显示
            </button>
          )}
        </div>

        {/* 视图控制 */}
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(1.25)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-[#c7d7f5] backdrop-blur hover:bg-white/[0.12]"
            title="放大"
          >
            +
          </button>
          <button
            onClick={() => zoomBy(0.8)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-[#c7d7f5] backdrop-blur hover:bg-white/[0.12]"
            title="缩小"
          >
            −
          </button>
          <button
            onClick={fit}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-[11px] text-[#c7d7f5] backdrop-blur hover:bg-white/[0.12]"
            title="适应窗口"
          >
            ⤢
          </button>
        </div>

        {/* 模式切换 */}
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/12 bg-[#0b1230]/80 p-1 backdrop-blur">
          <button
            onClick={() => onFocus(null)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] transition ${
              focusId ? "text-[#8fa8d4] hover:text-white" : "bg-white/12 text-white"
            }`}
          >
            全树
          </button>
          <button
            onClick={() => {
              if (focusId) return;
              const first = chapters[0];
              if (first) onFocus(first.id);
            }}
            className={`rounded-full px-3 py-1.5 text-[11.5px] transition ${
              focusId ? "bg-white/12 text-white" : "text-[#8fa8d4] hover:text-white"
            }`}
          >
            逐层
          </button>
          {focusId && (
            <span className="px-2 text-[11px] text-[#93a8cf]">
              {chapters.find((c) => c.id === focusId)?.name.replace(/^[一二三四五六七八九十]+、/, "")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
