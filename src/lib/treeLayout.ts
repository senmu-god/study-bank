/**
 * 知识树布局：数据驱动，支持「全树」与「逐层」两种模式。
 *
 * 层级对应关系（不新增层级，直接复用题库结构）：
 *   主干 = chapters（大章节）
 *   分枝 = sections（小节）
 *   叶片 = knowledge_points（知识点）
 *
 * 为什么需要两种模式：
 *   276 个知识点若全部带中文标签铺在一张图上，标签在角度方向上必然重叠，
 *   这是几何约束而非参数问题。因此：
 *   - 全树模式：看结构，叶片为状态光点，章节/小节名按碰撞检测择优显示；
 *   - 逐层模式：只展开一个章节，独占整幅扇形，叶片全名可见。
 */

import type { KpStatus } from "./kpStatus";

export interface LeafInput {
  id: string;
  name: string;
  status: KpStatus;
  questionCount: number;
  difficulty: string;
}

export interface SectionInput {
  id: string;
  name: string;
  order: number;
  leaves: LeafInput[];
}

export interface ChapterInput {
  id: string;
  name: string;
  order: number;
  sections: SectionInput[];
}

export interface LayoutLeaf {
  id: string;
  name: string;
  short: string;
  status: KpStatus;
  questionCount: number;
  x: number;
  y: number;
  r: number;
  angle: number;
  dirx: number;
  diry: number;
  sectionId: string;
  twig: string;
  showLabel: boolean;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
}

export interface LayoutSection {
  id: string;
  name: string;
  short: string;
  x: number;
  y: number;
  angle: number;
  path: string;
  leaves: LayoutLeaf[];
}

export interface LayoutChapter {
  id: string;
  name: string;
  short: string;
  x: number;
  y: number;
  angle: number;
  angleStart: number;
  angleEnd: number;
  path: string;
  sections: LayoutSection[];
  leafCount: number;
}

export interface TreeLayout {
  mode: "full" | "focus";
  focusId: string | null;
  bbox: { x: number; y: number; w: number; h: number };
  trunk: string;
  trunkHighlight: string;
  roots: { d: string; w: number }[];
  chapters: LayoutChapter[];
  stubs: { id: string; name: string; x: number; y: number; angle: number }[];
  leaves: LayoutLeaf[];
  sectionLabels: {
    id: string;
    name: string;
    full?: string;
    x: number;
    y: number;
    anchor: string;
  }[];
}

const DEG = Math.PI / 180;

/** 全树模式：扇形张角（度） */
const ARC_FULL = 174;
/** 逐层模式：单章节占满的张角 */
const ARC_FOCUS = 158;

const GEO_FULL = {
  chapterR: 340,
  sectionR: 545,
  leafR: [680, 750, 820],
  trunkTop: -34,
  trunkBottom: 148,
};

const GEO_FOCUS = {
  chapterR: 262,
  sectionR: 450,
  leafR: [640, 720, 800],
  trunkTop: -34,
  trunkBottom: 148,
};

/**
 * 横向压缩系数。
 * 174° 的扇形天然是"宽扁"的（宽高比约 1.5），而首页中间栏是竖长的，
 * 直接等比缩放会让树只占一半高度。把 x 轴压到 0.74 后宽高比接近 1，
 * 既填满面板，又保留树木向上生长的形态。
 */
const X_SQUEEZE = 0.62;

function polar(angleDeg: number, r: number) {
  const a = angleDeg * DEG;
  return { x: Math.sin(a) * r * X_SQUEEZE, y: -Math.cos(a) * r };
}

/** 稳定的字符串哈希：仅用于布局的确定性抖动，不参与任何业务判断 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 估算中文标签宽度（px） */
export function textWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) {
    w += /[\u4e00-\u9fa5]/.test(ch) ? fontSize : fontSize * 0.56;
  }
  return w;
}

export function shorten(s: string, max = 11): string {
  if (!s) return "";
  // 去掉大纲动词前缀，只用于展示，不改原始数据
  const cleaned = s.replace(/^(熟练掌握|掌握|理解|了解|会求|会|能)/, "").trim() || s;
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/**
 * 章节短名：8 条主干的标签在低缩放下会互相压住，
 * 这里只做展示层面的压缩，不改动原始章节名。
 *   一、函数、极限与连续        → 极限与连续
 *   二、一元函数微分学          → 一元微分
 *   四、向量代数与空间解析几何  → 向量代数
 */
export function shortChapterName(name: string): string {
  let s = name.replace(/^[一二三四五六七八九十]+、/, "").trim();
  s = s.replace(/^函数、/, "");
  const parts = s.split("、");
  if (parts.length > 1) s = parts[parts.length - 1];
  if (s.length > 6) {
    const i = s.indexOf("与");
    if (i > 2) s = s.slice(0, i);
  }
  s = s.replace(/^(一元|多元)函数/, "$1");
  s = s.replace(/微积分学$/, "微积分").replace(/微分学$/, "微分").replace(/积分学$/, "积分");
  return s.length > 7 ? s.slice(0, 7) : s;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function overlaps(a: Box, b: Box, pad = 3): boolean {
  return !(
    a.x1 + pad < b.x0 ||
    b.x1 + pad < a.x0 ||
    a.y1 + pad < b.y0 ||
    b.y1 + pad < a.y0
  );
}

function boxOf(x: number, y: number, w: number, h: number, anchor: string): Box {
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x0, y0: y - h, x1: x0 + w, y1: y + h * 0.35 };
}

/** 有机曲线：起点 → 终点，带垂直方向弧度 */
function curve(x0: number, y0: number, x1: number, y1: number, bow: number): string {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * bow;
  const cy = my + ny * bow;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export function buildLayout(
  chaptersInput: ChapterInput[],
  focusId: string | null = null
): TreeLayout {
  const chapters = [...chaptersInput].sort((a, b) => a.order - b.order);
  const focusChapter = focusId ? chapters.find((c) => c.id === focusId) || null : null;
  const mode: "full" | "focus" = focusChapter ? "focus" : "full";
  const geo = mode === "focus" ? GEO_FOCUS : GEO_FULL;
  const arc = mode === "focus" ? ARC_FOCUS : ARC_FULL;

  const drawList = focusChapter ? [focusChapter] : chapters;
  const totalLeaves = drawList.reduce(
    (s, c) => s + c.sections.reduce((n, sec) => n + sec.leaves.length, 0),
    0
  );

  const out: LayoutChapter[] = [];
  const allLeaves: LayoutLeaf[] = [];
  const sectionLabels: TreeLayout["sectionLabels"] = [];
  const labelBoxes: Box[] = [];

  let cursor = -arc / 2;

  drawList.forEach((ch, ci) => {
    const chLeaves = ch.sections.reduce((n, s) => n + s.leaves.length, 0);
    const share = totalLeaves > 0 ? (arc * chLeaves) / totalLeaves : arc / drawList.length;
    const angleStart = cursor;
    const angleEnd = cursor + share;
    cursor = angleEnd;
    const angle = (angleStart + angleEnd) / 2;

    const cPos = polar(angle, geo.chapterR);
    // 分枝起点沿树干错开：靠近竖直的章节从树干顶端抽出，
    // 越靠两侧的章节起点越低，避免所有枝条从同一点"喷"出去。
    const startY = geo.trunkTop + 4 + (Math.abs(angle) / 90) * 92;
    const chapterPath = curve(
      0,
      startY,
      cPos.x,
      cPos.y,
      (ci % 2 === 0 ? 1 : -1) * (18 + share * 0.35)
    );

    // 章节名标签：向外推让，避免相邻章节互相压住。
    // 标签在渲染时按屏幕字号恒定缩放，低缩放下的布局占位会变大，
    // 所以这里的碰撞盒按 1.7 倍保守估算。
    const chShort = shortChapterName(ch.name);
    const LABEL_INFLATE = 1.3;
    let chAnchor: "start" | "middle" | "end" =
      cPos.x > 60 ? "start" : cPos.x < -60 ? "end" : "middle";
    let chLx = 0;
    let chLy = 0;
    // 只允许小幅外推：推得太远会撞上小节层，反而更难读。
    for (const factor of [1.05, 1.12, 1.2]) {
      const p = polar(angle, geo.chapterR * factor);
      chAnchor = p.x > 60 ? "start" : p.x < -60 ? "end" : "middle";
      chLx = p.x + (chAnchor === "start" ? 10 : chAnchor === "end" ? -10 : 0);
      chLy = p.y + (chAnchor === "middle" ? -16 : 4);
      const box = boxOf(
        chLx,
        chLy,
        textWidth(chShort, 12) * LABEL_INFLATE,
        12 * LABEL_INFLATE,
        chAnchor
      );
      if (!labelBoxes.some((b) => overlaps(box, b))) {
        labelBoxes.push(box);
        break;
      }
    }
    sectionLabels.push({
      id: `chapter-${ch.id}`,
      name: chShort,
      full: ch.name,
      x: chLx,
      y: chLy,
      anchor: chAnchor,
    });

    const sections: LayoutSection[] = [];
    const secLeavesTotal = chLeaves || 1;
    let secCursor = angleStart;

    const orderedSections = [...ch.sections].sort((a, b) => a.order - b.order);

    orderedSections.forEach((sec, si) => {
      const n = sec.leaves.length;
      const secShare = (share * Math.max(n, 0.35)) / secLeavesTotal;
      const s0 = secCursor;
      const s1 = secCursor + secShare;
      secCursor = s1;
      const sAngle = (s0 + s1) / 2;
      const sPos = polar(sAngle, geo.sectionR);

      const secPath = curve(
        cPos.x,
        cPos.y,
        sPos.x,
        sPos.y,
        (si % 2 === 0 ? 1 : -1) * Math.max(6, secShare * 0.9)
      );

      // 小节标签：按碰撞择优显示
      const secShort = shorten(sec.name, mode === "focus" ? 14 : 9);
      const secW = textWidth(secShort, mode === "focus" ? 12 : 11);
      const secAnchor: "start" | "middle" | "end" =
        sPos.x > 55 ? "start" : sPos.x < -55 ? "end" : "middle";
      const lx = sPos.x + (secAnchor === "start" ? 9 : secAnchor === "end" ? -9 : 0);
      const ly = sPos.y + (secAnchor === "middle" ? -13 : 4);
      const secBox = boxOf(lx, ly, secW, 11, secAnchor);
      if (!labelBoxes.some((b) => overlaps(secBox, b))) {
        labelBoxes.push(secBox);
        sectionLabels.push({ id: sec.id, name: secShort, x: lx, y: ly, anchor: secAnchor });
      }

      const leaves: LayoutLeaf[] = [];
      const pad = Math.min(1.6, (s1 - s0) * 0.12);
      const span = Math.max(0, s1 - s0 - pad * 2);

      sec.leaves.forEach((leaf, li) => {
        const t = n <= 1 ? 0.5 : li / (n - 1);
        const la = s0 + pad + span * t;
        const ring = li % 3;
        // 树冠起伏：同一圈层的叶片按小节做确定性偏移，
        // 避免 276 个点整齐排在三条同心圆上（那样看起来像喷泉而不是树冠）。
        const jitter = (((hash(sec.id) >> (ring * 3)) & 7) - 3.5) * 9;
        const lr = geo.leafR[ring] + jitter;
        const lp = polar(la, lr);
        const a = la * DEG;
        // 方向向量需与压缩后的坐标一致，否则标签会被推歪
        const rawX = Math.sin(a) * X_SQUEEZE;
        const rawY = -Math.cos(a);
        const dlen = Math.hypot(rawX, rawY) || 1;
        const dirx = rawX / dlen;
        const diry = rawY / dlen;

        const twig = curve(
          sPos.x,
          sPos.y,
          lp.x,
          lp.y,
          (li % 2 === 0 ? 1 : -1) * 5
        );

        const short = shorten(leaf.name, mode === "focus" ? 13 : 8);

        leaves.push({
          id: leaf.id,
          name: leaf.name,
          short,
          status: leaf.status,
          questionCount: leaf.questionCount,
          x: lp.x,
          y: lp.y,
          r: mode === "focus" ? 5.2 : 3.4,
          angle: la,
          dirx,
          diry,
          sectionId: sec.id,
          twig,
          showLabel: false,
          labelX: 0,
          labelY: 0,
          anchor: "middle",
        });
      });

      sections.push({
        id: sec.id,
        name: sec.name,
        short: secShort,
        x: sPos.x,
        y: sPos.y,
        angle: sAngle,
        path: secPath,
        leaves,
      });
      allLeaves.push(...leaves);
    });

    out.push({
      id: ch.id,
      name: ch.name,
      short: shortChapterName(ch.name),
      x: cPos.x,
      y: cPos.y,
      angle,
      angleStart,
      angleEnd,
      path: chapterPath,
      sections,
      leafCount: chLeaves,
    });
  });

  // 逐层模式下，其余章节缩为底部小节点，作为章节切换入口
  const stubs: TreeLayout["stubs"] = [];
  if (focusChapter) {
    const others = chapters.filter((c) => c.id !== focusChapter.id);
    const span = 300;
    others.forEach((c, i) => {
      const t = others.length === 1 ? 0.5 : i / (others.length - 1);
      const x = -span / 2 + span * t;
      stubs.push({ id: c.id, name: c.name, x, y: 168 + (i % 2) * 16, angle: 0 });
    });
  }

  // 叶片标签：仅逐层模式显示，带外推避让
  if (mode === "focus") {
    const placed: Box[] = [...labelBoxes];
    const sorted = [...allLeaves].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const leaf of sorted) {
      const w = textWidth(leaf.short, 11.5);
      const anchor: "start" | "middle" | "end" =
        leaf.dirx > 0.22 ? "start" : leaf.dirx < -0.22 ? "end" : "middle";
      let ok = false;
      for (let push = 0; push <= 4 && !ok; push += 1) {
        const extra = 13 + push * 15;
        const lx = leaf.x + leaf.dirx * extra + (anchor === "start" ? 2 : anchor === "end" ? -2 : 0);
        const ly = leaf.y + leaf.diry * extra + (anchor === "middle" ? (leaf.diry > 0 ? 12 : -8) : 3);
        const box = boxOf(lx, ly, w, 11.5, anchor);
        if (!placed.some((b) => overlaps(box, b))) {
          placed.push(box);
          leaf.showLabel = true;
          leaf.labelX = lx;
          leaf.labelY = ly;
          leaf.anchor = anchor;
          ok = true;
        }
      }
      // 实在放不下就丢弃标签，靠悬停提示兜底
      if (!ok) {
        leaf.showLabel = false;
      }
    }
  }

  // 包围盒
  let minX = -80;
  let maxX = 80;
  let minY = -80;
  let maxY = 210;
  for (const ch of out) {
    minX = Math.min(minX, ch.x - 90);
    maxX = Math.max(maxX, ch.x + 90);
    minY = Math.min(minY, ch.y - 60);
    maxY = Math.max(maxY, ch.y + 40);
    for (const sec of ch.sections) {
      minX = Math.min(minX, sec.x - 80);
      maxX = Math.max(maxX, sec.x + 80);
      for (const leaf of sec.leaves) {
        minX = Math.min(minX, leaf.x - (leaf.showLabel && leaf.anchor === "end" ? 120 : 30));
        maxX = Math.max(maxX, leaf.x + (leaf.showLabel && leaf.anchor === "start" ? 120 : 30));
        minY = Math.min(minY, leaf.y - 26);
        maxY = Math.max(maxY, leaf.y + 26);
      }
    }
  }
  for (const s of stubs) {
    minX = Math.min(minX, s.x - 60);
    maxX = Math.max(maxX, s.x + 60);
    maxY = Math.max(maxY, s.y + 30);
  }

  const bbox = {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };

  // 树干与根须（按布局尺寸等比缩放，避免逐层模式树干过粗）
  const scale = mode === "focus" ? 0.92 : 1;
  const trunk = `M ${-30 * scale} ${geo.trunkBottom} C ${-24 * scale} 70 ${-15 * scale} 26 ${-8 * scale} ${geo.trunkTop} L ${8 * scale} ${geo.trunkTop} C ${15 * scale} 26 ${24 * scale} 70 ${30 * scale} ${geo.trunkBottom} Z`;
  const trunkHighlight = `M ${-6 * scale} ${geo.trunkBottom} C ${-4 * scale} 70 ${-2 * scale} 20 0 ${geo.trunkTop}`;

  const roots = [
    { d: `M ${-10 * scale} 140 C ${-48 * scale} 158 ${-96 * scale} 168 ${-150 * scale} 176`, w: 6.5 },
    { d: `M ${10 * scale} 140 C ${48 * scale} 158 ${96 * scale} 168 ${150 * scale} 176`, w: 6.5 },
    { d: `M ${-7 * scale} 150 C ${-34 * scale} 172 ${-62 * scale} 184 ${-92 * scale} 198`, w: 4.2 },
    { d: `M ${7 * scale} 150 C ${34 * scale} 172 ${62 * scale} 184 ${92 * scale} 198`, w: 4.2 },
    { d: `M 0 158 C 3 178 ${-4 * scale} 190 ${-11 * scale} 204`, w: 3.2 },
  ];

  return {
    mode,
    focusId: focusChapter?.id ?? null,
    bbox,
    trunk,
    trunkHighlight,
    roots,
    chapters: out,
    stubs,
    leaves: allLeaves,
    sectionLabels,
  };
}
