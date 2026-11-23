/**
 * IntroSplash — "breaking the ice" intro, tuned for buttery smoothness.
 *
 * NO Skia. All artwork is static (react-native-svg / expo-linear-gradient),
 * rendered once at mount inside memoized components whose props never change,
 * so it is rasterized up front and never redrawn. The ONLY things that change
 * per frame are `transform` + `opacity` of ~40 Animated.Views/Texts, all
 * derived on the UI thread from ONE shared value `t` (ms since the clock
 * started, advanced linearly by withTiming). No layout props, blur, shadows,
 * masks, animated SVG props or per-frame path building.
 *
 * Story: frosted slab with a faint bolt frozen inside → four player dots
 * slide in to its corners → a crack spreads (segments pop in) → slab shakes →
 * SHATTER (haptic; slab swaps for 8 pre-rendered shards that fly out) → the
 * bolt springs free → wordmark letters rise in → tagline → HOLD → onComplete.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import * as Haptics from "expo-haptics";
import { useFonts, Inter_800ExtraBold, Inter_500Medium } from "@expo-google-fonts/inter";

// ---------------------------------------------------------------------------
// TIMELINE (ms) — tweak everything here.
// ---------------------------------------------------------------------------
export const TIMELINE = {
  /** Slab fades + scales in (0.92 → 1). */
  slabIn: [0, 400] as const,
  /** Player dots slide in: dot i starts at start + i*stagger, lasts dur. */
  dots: { start: 150, stagger: 40, dur: 530 },
  /** Dots lean in a few px right before the break. */
  dotsPress: [950, 1150] as const,
  /** Crack segments pop in: crack c starts at start + c*crackStagger,
   *  its segment k at + k*segStagger, each pop lasts segDur. */
  crack: { start: 700, crackStagger: 55, segStagger: 75, segDur: 90 },
  /** Slab tension shake (decaying). */
  shake: [1000, 1150] as const,
  /** THE BREAK — haptic, slab hides, shards fly. */
  shatter: 1150,
  slabOut: 60,
  shardDur: [600, 700] as const,
  shardDelayMax: 50,
  /** Dots get pushed outward by the break. */
  dotsPush: [1150, 1600] as const,
  /** Bolt springs in: 0.6 → 1.08 (until overshootAt) → 1. */
  bolt: [1200, 1650] as const,
  boltOvershootAt: 1430,
  /** Glow behind the bolt: in, settle, one gentle pulse. */
  glowIn: [1200, 1450] as const,
  glowPulse: [1650, 2050] as const,
  /** Wordmark letters: letter i starts at start + i*stagger. */
  letters: { start: 1450, stagger: 45, dur: 380 },
  /** Tagline fade-up. */
  tagline: [2000, 2400] as const,
  /** Dots settle around the bolt, then drift gently. */
  settle: [1700, 2500] as const,
  /** onComplete fires here (wordmark done ~2.24s, tagline ~2.4s, +1.7s hold). */
  total: 4100,
  /** Reduce-motion: simple fade of bolt + wordmark (~1.2s) then 1.5s hold. */
  reduced: {
    bolt: [0, 700] as const,
    word: [150, 950] as const,
    tag: [350, 1200] as const,
    total: 2700,
  },
  /** `t` keeps running after `total` so the idle drift stays alive during the handoff. */
  idleTail: 20000,
};

export const INTRO_TOTAL_MS = TIMELINE.total;
export const INTRO_REDUCED_TOTAL_MS = TIMELINE.reduced.total;

// ---------------------------------------------------------------------------
// Palette (no green anywhere)
// ---------------------------------------------------------------------------
const C = {
  bgTop: "#0E0C1A",
  bgBottom: "#1D182D",
  lavender: "#BAA2F9",
  gradA: "#D6C4FA",
  gradB: "#A484EA",
  deep: "#5240A8",
  white: "#FFFFFF",
  peach: "#F7B7A3",
  pink: "#F49AC1",
  sky: "#9FC3FF",
};
const DOT_COLORS = [C.lavender, C.peach, C.pink, C.sky];

const WORDMARK = "Icebreaker";
const TAGLINE = "break the ice.";
const WORD_SIZE = 44;
const TAG_SIZE = 15;
const BOLT_H = 90;
const GLOW_SIZE = 160;
const DOT_BOX = 28;

// ---------------------------------------------------------------------------
// Worklet math helpers
// ---------------------------------------------------------------------------
function seg(t: number, a: number, b: number) {
  "worklet";
  return interpolate(t, [a, b], [0, 1], Extrapolation.CLAMP);
}
function lerp(a: number, b: number, p: number) {
  "worklet";
  return a + (b - a) * p;
}
function easeOutCubic(x: number) {
  "worklet";
  const u = 1 - x;
  return 1 - u * u * u;
}
function easeInOutCubic(x: number) {
  "worklet";
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function easeInOutSine(x: number) {
  "worklet";
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

// ---------------------------------------------------------------------------
// Geometry (computed once per screen size, JS thread)
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number };

/** Deterministic PRNG so the shatter looks identical every launch. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounded-square perimeter as a clockwise polygon (local coords, y down). */
function roundedRectPolygon(S: number, R: number, arcSteps = 5): Pt[] {
  const pts: Pt[] = [];
  const corners = [
    { cx: S - R, cy: R, a0: -Math.PI / 2 },
    { cx: S - R, cy: S - R, a0: 0 },
    { cx: R, cy: S - R, a0: Math.PI / 2 },
    { cx: R, cy: R, a0: Math.PI },
  ];
  for (const c of corners) {
    for (let i = 0; i <= arcSteps; i++) {
      const a = c.a0 + (i / arcSteps) * (Math.PI / 2);
      pts.push({ x: c.cx + R * Math.cos(a), y: c.cy + R * Math.sin(a) });
    }
  }
  return pts;
}

/** First intersection of a ray from O at angle θ with a closed polygon. */
function rayHit(O: Pt, theta: number, poly: Pt[]): { pt: Pt; seg: number } {
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let best = { pt: O, seg: 0, d: Infinity };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((a.x - O.x) * ey - (a.y - O.y) * ex) / den;
    const u = ((a.x - O.x) * dy - (a.y - O.y) * dx) / den;
    if (s > 0 && u >= 0 && u <= 1 && s < best.d) {
      best = { pt: { x: O.x + dx * s, y: O.y + dy * s }, seg: i, d: s };
    }
  }
  return { pt: best.pt, seg: best.seg };
}

type Box = { x: number; y: number; w: number; h: number };
function bbox(pts: Pt[], pad: number): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

type CrackSegData = {
  key: string;
  box: Box; // slab-local
  a: Pt; // box-local endpoints
  b: Pt;
  start: number;
};

type ShardData = {
  key: string;
  box: Box; // screen coords
  points: string; // svg polygon points, box-local
  gloss: { x1: number; y1: number; x2: number; y2: number };
  dirX: number;
  dirY: number;
  dist: number;
  rot: number; // deg
  scaleTo: number;
  delay: number;
  dur: number;
};

type DotData = {
  color: string;
  sx: number; sy: number; // start (off-screen)
  qx: number; qy: number; // bezier control
  tx: number; ty: number; // resting spot by a slab corner
  ux: number; uy: number; // outward unit (from slab center)
  fx: number; fy: number; // final spot around the bolt
  arrive: number;
  phase: number;
};

function buildScene(W: number, H: number) {
  const rand = mulberry32(0x1ceb4e);
  const S = Math.round(Math.min(W * 0.44, 200));
  const R = S * 0.22;
  const cx = W / 2;
  const cy = Math.round(H * 0.5 - 56); // slab + bolt center, a bit above middle
  const L = cx - S / 2;
  const T = cy - S / 2;

  // Impact point (slab-local), slightly off-center.
  const I: Pt = { x: S * 0.54, y: S * 0.46 };
  const perim = roundedRectPolygon(S, R);

  // 8 rays from I → shard boundaries; 4 of them are the visible cracks.
  const RAYS = 8;
  const base = -Math.PI * 0.55;
  const rays = Array.from({ length: RAYS }, (_, k) => {
    const th = base + (k * 2 * Math.PI) / RAYS + (rand() - 0.5) * 0.35;
    const hit = rayHit(I, th, perim);
    const len = Math.hypot(hit.pt.x - I.x, hit.pt.y - I.y);
    const nx = -Math.sin(th);
    const ny = Math.cos(th);
    const at = (f: number, jit: number): Pt => {
      const j = (rand() - 0.5) * 2 * jit;
      return { x: I.x + Math.cos(th) * len * f + nx * j, y: I.y + Math.sin(th) * len * f + ny * j };
    };
    const pts = [I, at(0.25, 3), at(0.5, 5), at(0.75, 5), hit.pt];
    return { th, pts, seg: hit.seg };
  });

  // --- cracks: two long (4 segments), two short (3 segments) ---------------
  const { start: c0, crackStagger, segStagger } = TIMELINE.crack;
  const crackRays = [
    { ray: 0, segs: 4 },
    { ray: 4, segs: 4 },
    { ray: 2, segs: 3 },
    { ray: 6, segs: 3 },
  ];
  const crackSegs: CrackSegData[] = [];
  crackRays.forEach(({ ray, segs }, c) => {
    const p = rays[ray].pts.slice();
    // stop the long cracks just shy of the rim
    p[4] = { x: lerp(p[3].x, p[4].x, 0.7), y: lerp(p[3].y, p[4].y, 0.7) };
    for (let k = 0; k < segs; k++) {
      const a = p[k];
      const b = p[k + 1];
      const box = bbox([a, b], 4);
      crackSegs.push({
        key: `c${c}s${k}`,
        box,
        a: { x: a.x - box.x, y: a.y - box.y },
        b: { x: b.x - box.x, y: b.y - box.y },
        start: c0 + c * crackStagger + k * segStagger,
      });
    }
  });

  // --- shards: wedge between consecutive rays + rim arc --------------------
  const perimBetween = (segA: number, segB: number): Pt[] => {
    const out: Pt[] = [];
    let i = segA;
    let guard = 0;
    while (i !== segB && guard++ < perim.length + 1) {
      i = (i + 1) % perim.length;
      out.push(perim[i]);
    }
    return out;
  };
  const shards: ShardData[] = rays.map((r0, k) => {
    const r1 = rays[(k + 1) % RAYS];
    const poly: Pt[] = [
      ...r0.pts,
      ...perimBetween(r0.seg, r1.seg),
      ...r1.pts.slice(1).reverse(),
    ];
    const ox = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const oy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    let dx = ox - I.x;
    let dy = oy - I.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const box = bbox(poly, 1.5);
    const gl = Math.min(box.w, box.h) * 0.16;
    const gx = ox - box.x - 3;
    const gy = oy - box.y - 3;
    const sign = rand() < 0.5 ? -1 : 1;
    return {
      key: `sh${k}`,
      box: { x: L + box.x, y: T + box.y, w: box.w, h: box.h },
      points: poly.map((p) => `${(p.x - box.x).toFixed(2)},${(p.y - box.y).toFixed(2)}`).join(" "),
      gloss: { x1: gx - gl, y1: gy + gl, x2: gx + gl, y2: gy - gl },
      dirX: dx,
      dirY: dy,
      dist: 140 + rand() * 120,
      rot: sign * (20 + rand() * 35),
      scaleTo: k % 2 === 0 ? 1.15 : 0.8,
      delay: rand() * TIMELINE.shardDelayMax,
      dur: TIMELINE.shardDur[0] + rand() * (TIMELINE.shardDur[1] - TIMELINE.shardDur[0]),
    };
  });

  // --- player dots ----------------------------------------------------------
  // Rest just outside each rounded corner (along the diagonal).
  const cornerD = (S / 2 - R) * Math.SQRT2 + R + 13;
  const diag = [
    { x: -1, y: -1 }, // TL — arrives from the left
    { x: 1, y: -1 }, // TR — from the top
    { x: 1, y: 1 }, // BR — from the right
    { x: -1, y: 1 }, // BL — from the bottom
  ];
  const starts: Pt[] = [
    { x: -20, y: cy - H * 0.16 },
    { x: W * 0.78, y: -20 },
    { x: W + 20, y: cy + H * 0.18 },
    { x: W * 0.22, y: H + 20 },
  ];
  const finals: Pt[] = [
    { x: -74, y: -34 },
    { x: 70, y: -44 },
    { x: 66, y: 30 },
    { x: -62, y: 34 },
  ];
  const dots: DotData[] = diag.map((dg, i) => {
    const ux = dg.x / Math.SQRT2;
    const uy = dg.y / Math.SQRT2;
    const tx = cx + ux * cornerD;
    const ty = cy + uy * cornerD;
    const st = starts[i];
    const len = Math.hypot(tx - st.x, ty - st.y) || 1;
    const bend = (i % 2 === 0 ? 1 : -1) * len * 0.18;
    return {
      color: DOT_COLORS[i],
      sx: st.x, sy: st.y,
      qx: (st.x + tx) / 2 + (-(ty - st.y) / len) * bend,
      qy: (st.y + ty) / 2 + ((tx - st.x) / len) * bend,
      tx, ty, ux, uy,
      fx: cx + finals[i].x, fy: cy + finals[i].y,
      arrive: TIMELINE.dots.start + i * TIMELINE.dots.stagger,
      phase: i * 1.7,
    };
  });

  const boltW = (BOLT_H * 492) / 755;
  const wordTop = cy + BOLT_H / 2 + 24;

  return { S, R, cx, cy, L, T, crackSegs, shards, dots, boltW, wordTop };
}

type Scene = ReturnType<typeof buildScene>;

// ---------------------------------------------------------------------------
// Static artwork (memoized; rendered once, never re-rendered mid-animation)
// ---------------------------------------------------------------------------

/** App-icon bolt on its 1024 artboard (bolt spans x 260..752, y 135..890). */
const BoltArt = memo(function BoltArt({ id, opacity = 1 }: { id: string; opacity?: number }) {
  return (
    <Svg width={(BOLT_H * 492) / 755} height={BOLT_H} viewBox="260 135 492 755">
      <Defs>
        <SvgLinearGradient id={`${id}u`} x1="300" y1="150" x2="560" y2="590" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={C.gradA} />
          <Stop offset="1" stopColor={C.gradB} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${id}l`} x1="700" y1="432" x2="420" y2="890" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={C.gradB} />
          <Stop offset="1" stopColor={C.deep} />
        </SvgLinearGradient>
      </Defs>
      <G opacity={opacity}>
        <Path d="M592 135 L530 432 L458 588 L260 588 Z" fill={`url(#${id}u)`} />
        <Path d="M752 432 L412 890 L458 588 Z" fill={`url(#${id}l)`} />
        <Path d="M530 432 L752 432 L458 588 Z" fill={C.gradA} />
      </G>
    </Svg>
  );
});

/** Shared frosted-ice gradient defs (objectBoundingBox → works for any shape). */
function IceDefs({ id }: { id: string }) {
  return (
    <>
      <SvgLinearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={C.white} stopOpacity={0.28} />
        <Stop offset="1" stopColor={C.lavender} stopOpacity={0.16} />
      </SvgLinearGradient>
      <SvgLinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={C.white} stopOpacity={0.7} />
        <Stop offset="1" stopColor={C.lavender} stopOpacity={0.25} />
      </SvgLinearGradient>
    </>
  );
}

/** Gloss streak: a line with a gradient that fades at both ends. */
function Streak({ id, cx, cy, half, width, alpha }: {
  id: string; cx: number; cy: number; half: number; width: number; alpha: number;
}) {
  const d = half / Math.SQRT2;
  const x1 = cx - d, y1 = cy + d, x2 = cx + d, y2 = cy - d;
  return (
    <>
      <Defs>
        <SvgLinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={C.white} stopOpacity={0} />
          <Stop offset="0.5" stopColor={C.white} stopOpacity={alpha} />
          <Stop offset="1" stopColor={C.white} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={`url(#${id})`} strokeWidth={width} strokeLinecap="round" />
    </>
  );
}

const SlabArt = memo(function SlabArt({ S, R }: { S: number; R: number }) {
  return (
    <Svg width={S} height={S}>
      <Defs>
        <IceDefs id="slab" />
        <SvgLinearGradient id="slabBand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.white} stopOpacity={0.16} />
          <Stop offset="0.32" stopColor={C.white} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0.75} y={0.75} width={S - 1.5} height={S - 1.5} rx={R} ry={R} fill="url(#slabf)" />
      {/* inner top highlight band */}
      <Rect x={3} y={3} width={S - 6} height={S - 6} rx={R - 3} ry={R - 3} fill="url(#slabBand)" />
      {/* diagonal gloss streaks, upper-left */}
      <Streak id="st1" cx={S * 0.36} cy={S * 0.36} half={S * 0.3} width={7} alpha={0.1} />
      <Streak id="st2" cx={S * 0.3} cy={S * 0.3} half={S * 0.24} width={1.6} alpha={0.22} />
      <Streak id="st3" cx={S * 0.46} cy={S * 0.46} half={S * 0.26} width={1.2} alpha={0.14} />
      {/* crisp edge */}
      <Rect
        x={0.75}
        y={0.75}
        width={S - 1.5}
        height={S - 1.5}
        rx={R}
        ry={R}
        fill="none"
        stroke="url(#slabs)"
        strokeWidth={1.5}
      />
    </Svg>
  );
});

const CrackArt = memo(function CrackArt({ s }: { s: CrackSegData }) {
  return (
    <Svg width={s.box.w} height={s.box.h}>
      <Line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={C.lavender} strokeOpacity={0.35} strokeWidth={4} strokeLinecap="round" />
      <Line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={C.white} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
});

const ShardArt = memo(function ShardArt({ s }: { s: ShardData }) {
  return (
    <Svg width={s.box.w} height={s.box.h}>
      <Defs>
        <IceDefs id={s.key} />
      </Defs>
      <Polygon points={s.points} fill={`url(#${s.key}f)`} stroke={`url(#${s.key}s)`} strokeWidth={1} strokeLinejoin="round" />
      <Line {...s.gloss} stroke={C.white} strokeOpacity={0.2} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
});

const DotArt = memo(function DotArt({ color }: { color: string }) {
  const c = DOT_BOX / 2;
  return (
    <Svg width={DOT_BOX} height={DOT_BOX}>
      <Circle cx={c} cy={c} r={13} fill={color} fillOpacity={0.1} />
      <Circle cx={c} cy={c} r={9} fill={color} fillOpacity={0.2} />
      <Circle cx={c} cy={c} r={5} fill={color} />
      <Circle cx={c - 1.5} cy={c - 1.6} r={1.6} fill={C.white} fillOpacity={0.65} />
    </Svg>
  );
});

const GlowArt = memo(function GlowArt({ size, alpha, id }: { size: number; alpha: number; id: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={C.lavender} stopOpacity={alpha} />
          <Stop offset="0.45" stopColor={C.lavender} stopOpacity={alpha * 0.4} />
          <Stop offset="1" stopColor={C.lavender} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
});

const Background = memo(function Background({ W, cx, cy }: { W: number; cx: number; cy: number }) {
  const g = W * 1.5;
  return (
    <>
      <LinearGradient colors={[C.bgTop, C.bgBottom]} style={StyleSheet.absoluteFill} />
      <View style={{ position: "absolute", left: cx - g / 2, top: cy - g / 2 }}>
        <GlowArt size={g} alpha={0.13} id="bgGlow" />
      </View>
    </>
  );
});

// ---------------------------------------------------------------------------
// Animated pieces (transform + opacity only)
// ---------------------------------------------------------------------------
type TProps = { t: SharedValue<number> };

const Slab = memo(function Slab({ t, sc }: TProps & { sc: Scene }) {
  const style = useAnimatedStyle(() => {
    const tv = t.value;
    const inP = easeOutCubic(seg(tv, TIMELINE.slabIn[0], TIMELINE.slabIn[1]));
    const out = seg(tv, TIMELINE.shatter, TIMELINE.shatter + TIMELINE.slabOut);
    const k = seg(tv, TIMELINE.shake[0], TIMELINE.shake[1]);
    const env = k <= 0 || k >= 1 ? 0 : k < 0.2 ? k / 0.2 : (1 - k) / 0.8;
    return {
      opacity: inP * (1 - out),
      transform: [
        { translateX: 3 * env * Math.sin(tv * 0.11) },
        { translateY: 2 * env * Math.sin(tv * 0.137 + 1.3) },
        { scale: lerp(0.92, 1, inP) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: sc.L, top: sc.T, width: sc.S, height: sc.S }, style]}>
      <SlabArt S={sc.S} R={sc.R} />
      <View style={{ position: "absolute", left: (sc.S - sc.boltW) / 2, top: (sc.S - BOLT_H) / 2 }}>
        <BoltArt id="frozen" opacity={0.3} />
      </View>
      {sc.crackSegs.map((s) => (
        <CrackSeg key={s.key} t={t} s={s} />
      ))}
    </Animated.View>
  );
});

const CrackSeg = memo(function CrackSeg({ t, s }: TProps & { s: CrackSegData }) {
  const { start } = s;
  const style = useAnimatedStyle(() => {
    const raw = seg(t.value, start, start + TIMELINE.crack.segDur);
    return {
      opacity: Math.min(1, raw * 1.6),
      transform: [{ scale: lerp(0.6, 1, easeOutCubic(raw)) }],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: s.box.x, top: s.box.y }, style]}>
      <CrackArt s={s} />
    </Animated.View>
  );
});

const Shard = memo(function Shard({ t, s }: TProps & { s: ShardData }) {
  const { dirX, dirY, dist, rot, scaleTo, delay, dur } = s;
  const S0 = TIMELINE.shatter + delay;
  const style = useAnimatedStyle(() => {
    const tv = t.value;
    if (tv < TIMELINE.shatter) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 1 }] };
    const raw = seg(tv, S0, S0 + dur);
    const p = easeOutCubic(raw);
    return {
      opacity: 1 - raw * raw,
      transform: [
        { translateX: dirX * dist * p },
        { translateY: dirY * dist * p },
        { rotate: `${rot * p}deg` },
        { scale: lerp(1, scaleTo, p) },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: s.box.x, top: s.box.y, opacity: 0 }, style]}>
      <ShardArt s={s} />
    </Animated.View>
  );
});

const Dot = memo(function Dot({ t, d }: TProps & { d: DotData }) {
  const { sx, sy, qx, qy, tx, ty, ux, uy, fx, fy, arrive, phase } = d;
  const style = useAnimatedStyle(() => {
    const tv = t.value;
    const raw = seg(tv, arrive, arrive + TIMELINE.dots.dur);
    const p = easeOutCubic(raw);
    const u = 1 - p;
    let x = u * u * sx + 2 * u * p * qx + p * p * tx;
    let y = u * u * sy + 2 * u * p * qy + p * p * ty;
    const press = easeInOutSine(seg(tv, TIMELINE.dotsPress[0], TIMELINE.dotsPress[1])) * 3;
    const push = easeOutCubic(seg(tv, TIMELINE.dotsPush[0], TIMELINE.dotsPush[1])) * 28;
    x += ux * (push - press);
    y += uy * (push - press);
    const s = easeInOutCubic(seg(tv, TIMELINE.settle[0], TIMELINE.settle[1]));
    const amp = 3 * s;
    const ex = fx + amp * Math.sin(tv * 0.0013 + phase);
    const ey = fy + amp * Math.cos(tv * 0.0011 + phase * 1.3);
    return {
      opacity: Math.min(1, raw * 2.5),
      transform: [
        { translateX: lerp(x, ex, s) - DOT_BOX / 2 },
        { translateY: lerp(y, ey, s) - DOT_BOX / 2 },
      ],
    };
  });
  return (
    <Animated.View style={[styles.origin, { opacity: 0 }, style]}>
      <DotArt color={d.color} />
    </Animated.View>
  );
});

const BoltGlow = memo(function BoltGlow({ t, sc, reduced }: TProps & { sc: Scene; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    const tv = t.value;
    if (reduced) return { opacity: 0.5 * easeOutCubic(seg(tv, TIMELINE.reduced.bolt[0], TIMELINE.reduced.bolt[1])) };
    let g: number;
    if (tv < TIMELINE.glowIn[1]) g = 0.8 * easeOutCubic(seg(tv, TIMELINE.glowIn[0], TIMELINE.glowIn[1]));
    else if (tv < TIMELINE.glowPulse[0]) g = lerp(0.8, 0.5, easeInOutSine(seg(tv, TIMELINE.glowIn[1], TIMELINE.glowPulse[0])));
    else g = 0.5 + 0.25 * Math.sin(Math.PI * seg(tv, TIMELINE.glowPulse[0], TIMELINE.glowPulse[1]));
    return { opacity: g };
  });
  return (
    <Animated.View
      style={[{ position: "absolute", left: sc.cx - GLOW_SIZE / 2, top: sc.cy - GLOW_SIZE / 2, opacity: 0 }, style]}
    >
      <GlowArt size={GLOW_SIZE} alpha={0.55} id="boltGlow" />
    </Animated.View>
  );
});

const Bolt = memo(function Bolt({ t, sc, reduced }: TProps & { sc: Scene; reduced: boolean }) {
  const style = useAnimatedStyle(() => {
    const tv = t.value;
    if (reduced) {
      return { opacity: easeOutCubic(seg(tv, TIMELINE.reduced.bolt[0], TIMELINE.reduced.bolt[1])), transform: [{ scale: 1 }] };
    }
    const [b0, b1] = TIMELINE.bolt;
    const s =
      tv < TIMELINE.boltOvershootAt
        ? lerp(0.6, 1.08, easeOutCubic(seg(tv, b0, TIMELINE.boltOvershootAt)))
        : lerp(1.08, 1, easeInOutSine(seg(tv, TIMELINE.boltOvershootAt, b1)));
    return { opacity: easeOutCubic(seg(tv, b0, b0 + 180)), transform: [{ scale: s }] };
  });
  return (
    <Animated.View
      style={[{ position: "absolute", left: sc.cx - sc.boltW / 2, top: sc.cy - BOLT_H / 2, opacity: 0 }, style]}
    >
      <BoltArt id="bolt" />
    </Animated.View>
  );
});

const Letter = memo(function Letter({
  t, ch, index, reduced, fontReady,
}: TProps & { ch: string; index: number; reduced: boolean; fontReady: boolean }) {
  const start = TIMELINE.letters.start + index * TIMELINE.letters.stagger;
  const style = useAnimatedStyle(() => {
    if (reduced) {
      return { opacity: easeOutCubic(seg(t.value, TIMELINE.reduced.word[0], TIMELINE.reduced.word[1])), transform: [{ translateY: 0 }, { scale: 1 }] };
    }
    const raw = seg(t.value, start, start + TIMELINE.letters.dur);
    const e = easeOutCubic(raw);
    return {
      opacity: Math.min(1, raw * 1.4),
      transform: [{ translateY: 14 * (1 - e) }, { scale: lerp(0.85, 1, e) }],
    };
  });
  return (
    <Animated.Text style={[styles.letter, fontReady ? styles.letterFont : styles.letterFallback, { opacity: 0 }, style]}>
      {ch}
    </Animated.Text>
  );
});

const Tagline = memo(function Tagline({ t, reduced, fontReady }: TProps & { reduced: boolean; fontReady: boolean }) {
  const style = useAnimatedStyle(() => {
    const [a, b] = reduced ? TIMELINE.reduced.tag : TIMELINE.tagline;
    const e = easeOutCubic(seg(t.value, a, b));
    return { opacity: e, transform: [{ translateY: reduced ? 0 : 8 * (1 - e) }] };
  });
  return (
    <Animated.Text style={[styles.tagline, fontReady ? styles.tagFont : styles.tagFallback, { opacity: 0 }, style]}>
      {TAGLINE}
    </Animated.Text>
  );
});

// ---------------------------------------------------------------------------
// IntroSplash
// ---------------------------------------------------------------------------
function fireHaptic() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    // haptics unavailable — ignore
  }
}

/** If the fonts haven't loaded by now, start the intro anyway. */
const FONT_FALLBACK_MS = 1500;
/** Small cushion after the first painted frames before `t` starts moving. */
const START_DELAY_MS = 180;
/** If the app never reports ready, start the intro anyway after this long. */
const APP_READY_FALLBACK_MS = 3000;

type IntroSplashProps = {
  /** Called once, when the master clock actually starts (content is on screen). */
  onStart?: () => void;
  /** Called once, when `t` crosses TIMELINE.total (or the reduced total). */
  onComplete?: () => void;
  /**
   * Hold the clock until the app tree behind the splash has mounted, so the
   * heavy first mount never lands mid-animation.
   */
  canStart?: boolean;
};

const LETTERS = WORDMARK.split("");

function IntroSplash({ onStart, onComplete, canStart = true }: IntroSplashProps) {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const sc = useMemo(() => buildScene(W, H), [W, H]);

  // Same fonts the root layout loads — resolves instantly once cached.
  const [fontsLoaded, fontError] = useFonts({ Inter_800ExtraBold, Inter_500Medium });
  const fontReady = fontsLoaded && !fontError;

  // ---- the master clock ----
  const t = useSharedValue(0);
  const gate = useSharedValue(0);
  const totalMs = useSharedValue<number>(TIMELINE.total);

  const onStartRef = useRef(onStart);
  const onCompleteRef = useRef(onComplete);
  onStartRef.current = onStart;
  onCompleteRef.current = onComplete;

  const [fontFallback, setFontFallback] = useState(false);
  const [readyFallback, setReadyFallback] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  // Fallback timers only matter before the clock starts — never re-render
  // the splash mid-animation because of them.
  useEffect(() => {
    const id = setTimeout(() => {
      if (!startedRef.current) setFontFallback(true);
    }, FONT_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      if (!startedRef.current) setReadyFallback(true);
    }, APP_READY_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

  const fontsGate = fontsLoaded || !!fontError || fontFallback;
  const appGate = canStart || readyFallback;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setLaidOut(true);
  }, []);

  useEffect(() => {
    if (!fontsGate || !laidOut || !appGate || startedRef.current) return;
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (cancelled || startedRef.current) return;
        startedRef.current = true;
        const total = reduced ? TIMELINE.reduced.total : TIMELINE.total;
        const end = total + TIMELINE.idleTail;
        totalMs.value = total;
        gate.value = 1;
        t.value = withDelay(START_DELAY_MS, withTiming(end, { duration: end, easing: Easing.linear }));
        onStartRef.current?.();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [fontsGate, laidOut, appGate, reduced, t, gate, totalMs]);

  useEffect(() => () => cancelAnimation(t), [t]);

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, []);

  // onComplete exactly once as t crosses the (reduced) total.
  useAnimatedReaction(
    () => gate.value === 1 && t.value >= totalMs.value,
    (now, prev) => {
      if (now && !prev) scheduleOnRN(fireComplete);
    },
    [fireComplete],
  );

  // Haptic exactly once, one frame after the shatter swap.
  useAnimatedReaction(
    () => t.value >= TIMELINE.shatter + 16,
    (now, prev) => {
      if (!reduced && now && !prev) scheduleOnRN(fireHaptic);
    },
    [reduced],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={handleLayout}>
      <Background W={W} cx={sc.cx} cy={sc.cy} />

      {!reduced && <Slab t={t} sc={sc} />}
      {!reduced && sc.shards.map((s) => <Shard key={s.key} t={t} s={s} />)}

      <BoltGlow t={t} sc={sc} reduced={reduced} />
      <Bolt t={t} sc={sc} reduced={reduced} />

      {!reduced && sc.dots.map((d, i) => <Dot key={i} t={t} d={d} />)}

      <View style={[styles.wordBlock, { top: sc.wordTop }]}>
        <View style={styles.wordRow}>
          {LETTERS.map((ch, i) => (
            <Letter key={i} t={t} ch={ch} index={i} reduced={reduced} fontReady={fontReady} />
          ))}
        </View>
        <Tagline t={t} reduced={reduced} fontReady={fontReady} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { position: "absolute", left: 0, top: 0 },
  wordBlock: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  wordRow: { flexDirection: "row", justifyContent: "center" },
  letter: {
    color: C.white,
    fontSize: WORD_SIZE,
    lineHeight: WORD_SIZE * 1.2,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  letterFont: { fontFamily: "Inter_800ExtraBold" },
  letterFallback: { fontWeight: "800" },
  tagline: {
    marginTop: 6,
    color: "rgba(186,162,249,0.85)",
    fontSize: TAG_SIZE,
    includeFontPadding: false,
  },
  tagFont: { fontFamily: "Inter_500Medium" },
  tagFallback: { fontWeight: "500" },
});

export default memo(IntroSplash);
