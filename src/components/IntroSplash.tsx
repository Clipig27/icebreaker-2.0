/**
 * IntroSplash — cinematic "breaking the ice" intro.
 *
 * One full-screen Skia <Canvas>, driven entirely by a single Reanimated
 * shared value `t` (ms since the clock STARTED, advanced linearly on the UI
 * thread). The clock waits until fonts are loaded (1.5s fallback), the Canvas
 * has laid out, and two frames have passed — so the whole story is actually
 * seen. Every animated prop is a `useDerivedValue` worklet of `t`, so the
 * JS thread can be busy (auth init, router mount) without dropping frames.
 * All geometry (slab, crack polylines + their trimmed reveal frames, shard
 * polygons, bolt facets, glyph outlines) is precomputed once with useMemo;
 * worklets only pick/transform existing Skia objects, never create them.
 *
 * Story: frosted ice slab with a bolt frozen inside → four "players" drift in
 * and meet at the slab → a crack spreads from where they meet → SHATTER
 * (haptic, bloom, shockwave, shards fly) → the bolt springs free → wordmark
 * letters resolve, a light sweep passes → tagline → the players settle around
 * the bolt like a little group.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  Text,
  useFont,
  vec,
  type SkFont,
  type SkPath,
  type Transforms3d,
} from "@shopify/react-native-skia";
import {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Inter_800ExtraBold, Inter_500Medium } from "@expo-google-fonts/inter";

// ---------------------------------------------------------------------------
// TIMELINE (ms) — tweak everything here.
// ---------------------------------------------------------------------------
export const TIMELINE = {
  /** Background gradient glow + ice slab fade/scale in (0.94 → 1). */
  slabIn: [0, 350] as const,
  /** Player dots drift in: dot i starts at start + i*stagger, lasts dur. */
  dots: { start: 150, stagger: 60, dur: 470 },
  /** Dots lean into the slab right before it breaks. */
  dotsPress: [950, 1150] as const,
  /** Crack spreading window (main crack first, branches staggered). */
  crack: [700, 1150] as const,
  /** Slab tension shake (decaying sine). */
  tension: [1000, 1150] as const,
  /** Screen-wide brightness micro-pulse just before the break. */
  prePulse: [1070, 1150] as const,
  /** THE BREAK — haptic, slab → shards, bloom, shockwave. */
  shatter: 1150,
  shardDur: [550, 750] as const,
  shardDelayMax: 60,
  bloomDur: 450,
  ringDur: 560,
  dotsPushDur: 500,
  /** Bolt springs in: 0.6 → 1.08 (until overshootAt) → 1. */
  bolt: [1200, 1650] as const,
  boltOvershootAt: 1420,
  /** One gentle glow pulse after the bolt lands. */
  glowPulse: [1650, 1950] as const,
  /** Wordmark letters: letter i starts at start + i*stagger. */
  letters: { start: 1450, stagger: 45, dur: 360 },
  /** Diagonal light sweep across the wordmark. */
  sweep: [1900, 2450] as const,
  /** Tagline fade-up. */
  tagline: [1950, 2350] as const,
  /** Dots settle into a slow orbit around the bolt. */
  settle: [1700, 2500] as const,
  /** Minimum on-screen time before the root layout may hand off. */
  total: 2600,
  /** Reduce-motion variant: simple fade of bolt + wordmark. */
  reduced: { fade: [0, 400] as const, total: 1200 },
  /** `t` keeps running after `total` so idle breathing/orbit stays alive. */
  idleTail: 60000,
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
const LETTER_SPACING = -0.5;

// ---------------------------------------------------------------------------
// Pre-warm
// ---------------------------------------------------------------------------
/**
 * Effectively-invisible opacity used to keep "later" elements drawing from
 * the very first frame (incl. the pre-start wait, while t === 0) so Skia
 * compiles their pipelines / caches up front instead of hitching on first
 * appearance. Must stay > 0: Skia skips draws whose paint alpha rounds to 0,
 * so for colors that carry their own alpha we divide (WARM / colorAlpha).
 * Nothing ever mounts/unmounts mid-animation — only opacity/transform change.
 */
const WARM = 0.004;
/** Shard stroke color carries alpha 0.6 → floor so it still rounds above 0. */
const SHARD_WARM = WARM / 0.6;
/** Blurred letter copies (an image-filter layer each) only warm up until the
 *  crack starts — keeps 10 filter layers out of the shatter frames. */
const LETTER_WARM_END = TIMELINE.crack[0];

// ---------------------------------------------------------------------------
// Worklet math helpers
// ---------------------------------------------------------------------------
/** 0→1 progress of t through [a, b], clamped. */
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
function easeInCubic(x: number) {
  "worklet";
  return x * x * x;
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
// Geometry (computed once per screen size, on the JS thread)
// ---------------------------------------------------------------------------
type Pt = { x: number; y: number };

/** Deterministic PRNG so the shatter looks the same every launch. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function polyPath(pts: Pt[], close = true): SkPath {
  const b = Skia.PathBuilder.Make();
  pts.forEach((pt, i) => (i === 0 ? b.moveTo(pt.x, pt.y) : b.lineTo(pt.x, pt.y)));
  if (close) b.close();
  return b.detach();
}

/** Rounded-rect perimeter as a clockwise polygon (screen coords, y down). */
function roundedRectPolygon(L: number, T: number, S: number, R: number, arcSteps = 6): Pt[] {
  const pts: Pt[] = [];
  const corners = [
    { cx: L + S - R, cy: T + R, a0: -Math.PI / 2 }, // top-right
    { cx: L + S - R, cy: T + S - R, a0: 0 }, // bottom-right
    { cx: L + R, cy: T + S - R, a0: Math.PI / 2 }, // bottom-left
    { cx: L + R, cy: T + R, a0: Math.PI }, // top-left
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
    const s = ((a.x - O.x) * ey - (a.y - O.y) * ex) / den; // along ray
    const u = ((a.x - O.x) * dy - (a.y - O.y) * dx) / den; // along edge
    if (s > 0 && u >= 0 && u <= 1 && s < best.d) {
      best = { pt: { x: O.x + dx * s, y: O.y + dy * s }, seg: i, d: s };
    }
  }
  return { pt: best.pt, seg: best.seg };
}

/** App-icon bolt facets (1024px artboard), centered on (cx, cy) at height h. */
function buildBolt(cx: number, cy: number, h: number) {
  const k = h / 755; // artboard bolt spans y 135..890
  const m = (x: number, y: number): Pt => ({ x: cx + (x - 506) * k, y: cy + (y - 512) * k });
  const upper = [m(592, 135), m(530, 432), m(458, 588), m(260, 588)];
  const middle = [m(530, 432), m(752, 432), m(458, 588)];
  const lower = [m(752, 432), m(412, 890), m(458, 588)];
  const silhouette = [m(592, 135), m(530, 432), m(752, 432), m(412, 890), m(458, 588), m(260, 588)];
  return {
    upper: polyPath(upper),
    middle: polyPath(middle),
    lower: polyPath(lower),
    silhouette: polyPath(silhouette),
    top: cy - h / 2,
    bottom: cy + h / 2,
    left: m(260, 0).x,
    right: m(752, 0).x,
  };
}

type ShardData = {
  path: SkPath;
  // numeric motion params (safe to capture in worklets)
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  dist: number;
  rot: number;
  scaleTo: number;
  delay: number;
  dur: number;
};

/**
 * `frames[k]` is the crack trimmed to endMax * k/CRACK_STEPS, precomputed once
 * so the reveal never allocates a path on the UI thread (Path start/end would
 * copy + trim the path every frame).
 */
type CrackData = { path: SkPath; frames: SkPath[]; start: number; dur: number };
const CRACK_STEPS = 28;

type DotData = {
  color: string;
  sx: number; sy: number; // start (off-screen-ish)
  qx: number; qy: number; // bezier control
  tx: number; ty: number; // target at slab edge
  px: number; py: number; // push direction (unit, away from impact)
  orbit: number; // final orbit angle (rad)
  arrive: number; // arrival start ms
};

function buildScene(W: number, H: number) {
  const rand = mulberry32(0x1ceb4e);
  const cx = W / 2;
  const S = Math.min(W * 0.46, 210); // slab size
  const R = S * 0.2; // corner radius
  const boltH = Math.min(S * 0.62, 122);
  // Center the final bolt+wordmark+tagline group a touch above mid-screen.
  const cy = H * 0.47 - 46;
  const L = cx - S / 2;
  const T = cy - S / 2;

  const slabRRect = Skia.RRectXY(Skia.XYWHRect(L, T, S, S), R, R);
  const slabClip = Skia.PathBuilder.Make().addRRect(slabRRect).detach();

  // Impact point — where the players "meet", slightly off-center.
  const I: Pt = { x: cx + S * 0.07, y: cy - S * 0.05 };

  // --- crack rays & shards -------------------------------------------------
  const perim = roundedRectPolygon(L, T, S, R);
  const RAYS = 7;
  const base = -Math.PI * 0.42;
  const thetas: number[] = [];
  for (let k = 0; k < RAYS; k++) {
    const jitter = (rand() - 0.5) * 0.5 * ((2 * Math.PI) / RAYS);
    thetas.push(base + (k * 2 * Math.PI) / RAYS + jitter);
  }

  // Each ray: jagged polyline I → j1 → A (inner ring) → j2 → B (edge).
  const rays = thetas.map((th) => {
    const hit = rayHit(I, th, perim);
    const B = hit.pt;
    const len = Math.hypot(B.x - I.x, B.y - I.y);
    const nx = -Math.sin(th);
    const ny = Math.cos(th);
    const f = 0.32 + rand() * 0.18;
    const at = (frac: number, jit: number): Pt => {
      const j = (rand() - 0.5) * 2 * jit;
      return { x: I.x + Math.cos(th) * len * frac + nx * j, y: I.y + Math.sin(th) * len * frac + ny * j };
    };
    const j1 = at(f * 0.5, 4);
    const A = at(f, 5);
    const j2 = at(f + (1 - f) * 0.5, 6);
    const j3 = at(f + (1 - f) * 0.8, 4);
    return { pts: [I, j1, A, j2, j3, B], seg: hit.seg, theta: th };
  });

  // Jagged inner-ring connector between consecutive A points.
  const ringMid = rays.map((r, k) => {
    const A0 = r.pts[2];
    const A1 = rays[(k + 1) % RAYS].pts[2];
    return {
      x: (A0.x + A1.x) / 2 + (rand() - 0.5) * 8,
      y: (A0.y + A1.y) / 2 + (rand() - 0.5) * 8,
    };
  });

  const perimBetween = (segA: number, segB: number): Pt[] => {
    // perimeter vertices after segA's start up to and including segB's start
    const out: Pt[] = [];
    let i = segA;
    let guard = 0;
    while (i !== segB && guard++ < perim.length + 1) {
      i = (i + 1) % perim.length;
      out.push(perim[i]);
    }
    return out;
  };

  const shardPolys: { poly: Pt[]; inner: boolean; midTheta: number }[] = [];
  for (let k = 0; k < RAYS; k++) {
    const r0 = rays[k];
    const r1 = rays[(k + 1) % RAYS];
    const M = ringMid[k];
    let midTheta = (r0.theta + r1.theta) / 2;
    if (k === RAYS - 1) midTheta = (r0.theta + r1.theta + 2 * Math.PI) / 2;
    // inner shard: I → j1 → A0 → M → A1 → j1' → (I)
    shardPolys.push({
      poly: [I, r0.pts[1], r0.pts[2], M, r1.pts[2], r1.pts[1]],
      inner: true,
      midTheta,
    });
    // outer shard: A0 → … → B0 → perimeter → B1 → … → A1 → M
    shardPolys.push({
      poly: [
        r0.pts[2], r0.pts[3], r0.pts[4], r0.pts[5],
        ...perimBetween(r0.seg, r1.seg),
        r1.pts[5], r1.pts[4], r1.pts[3], r1.pts[2], M,
      ],
      inner: false,
      midTheta,
    });
  }

  const shards: ShardData[] = shardPolys.map(({ poly, inner, midTheta }, i) => {
    const ox = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const oy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    let dx = ox - I.x;
    let dy = oy - I.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      dx = Math.cos(midTheta);
      dy = Math.sin(midTheta);
    } else {
      dx /= d;
      dy /= d;
    }
    const sign = rand() < 0.5 ? -1 : 1;
    const deg = 15 + rand() * 45;
    return {
      path: polyPath(poly),
      ox,
      oy,
      dirX: dx,
      dirY: dy,
      dist: (inner ? 120 : 150) + rand() * (inner ? 90 : 110),
      rot: (sign * deg * Math.PI) / 180,
      scaleTo: i % 3 === 0 ? 0.72 : 1.1 + rand() * 0.2,
      delay: rand() * TIMELINE.shardDelayMax,
      dur: TIMELINE.shardDur[0] + rand() * (TIMELINE.shardDur[1] - TIMELINE.shardDur[0]),
    };
  });

  // Cracks: main crack (two opposite rays from I) + staggered branches.
  const [c0, c1] = TIMELINE.crack;
  const rayPath = (k: number) => polyPath(rays[k].pts, false);
  const emptyPath = Skia.Path.Make();
  const crack = (path: SkPath, start: number, dur: number, endMax: number): CrackData => {
    const frames: SkPath[] = [emptyPath];
    for (let k = 1; k <= CRACK_STEPS; k++) {
      frames.push(Skia.Path.Trim(path, 0, (endMax * k) / CRACK_STEPS, false) ?? emptyPath);
    }
    return { path, frames, start, dur };
  };
  const cracks: CrackData[] = [
    crack(rayPath(0), c0, 300, 1),
    crack(rayPath(3), c0 + 20, 300, 1),
    crack(rayPath(5), c0 + 110, 280, 0.9),
    crack(rayPath(1), c0 + 170, 260, 0.8),
    crack(rayPath(4), c0 + 230, 220, 0.7),
    crack(polyPath([rays[0].pts[2], ringMid[0], rays[1].pts[2]], false), c1 - 170, 150, 1),
  ];

  // --- player dots ---------------------------------------------------------
  const B = cy + S / 2;
  const Rr = cx + S / 2;
  const targets: Pt[] = [
    { x: L - 9, y: cy - S * 0.12 }, // left edge
    { x: cx + S * 0.18, y: T - 9 }, // top edge
    { x: Rr + 9, y: cy + S * 0.1 }, // right edge
    { x: cx - S * 0.15, y: B + 9 }, // bottom edge
  ];
  const starts: Pt[] = [
    { x: -24, y: cy - H * 0.22 },
    { x: W * 0.86, y: -24 },
    { x: W + 24, y: cy + H * 0.26 },
    { x: W * 0.14, y: H + 24 },
  ];
  // Final orbit angles (around the bolt, avoiding the wordmark below).
  const orbits = [170, 250, 335, 130].map((a) => (a * Math.PI) / 180);
  const dots: DotData[] = targets.map((tg, i) => {
    const st = starts[i];
    const mx = (st.x + tg.x) / 2;
    const my = (st.y + tg.y) / 2;
    const len = Math.hypot(tg.x - st.x, tg.y - st.y);
    const nx = -(tg.y - st.y) / len;
    const ny = (tg.x - st.x) / len;
    const bend = (i % 2 === 0 ? 1 : -1) * len * 0.2;
    let px = tg.x - I.x;
    let py = tg.y - I.y;
    const pl = Math.hypot(px, py) || 1;
    px /= pl;
    py /= pl;
    return {
      color: DOT_COLORS[i],
      sx: st.x, sy: st.y,
      qx: mx + nx * bend, qy: my + ny * bend,
      tx: tg.x, ty: tg.y,
      px, py,
      orbit: orbits[i],
      arrive: TIMELINE.dots.start + i * TIMELINE.dots.stagger,
    };
  });

  // Ice surface decoration (absolute coords; clipped per slab / shard).
  const streakA = polyPath([
    { x: L + S * 0.4, y: T - 4 }, { x: L + S * 0.62, y: T - 4 },
    { x: L - 4, y: T + S * 0.66 }, { x: L - 4, y: T + S * 0.44 },
  ]);
  const streakB = polyPath([
    { x: L + S * 0.7, y: T - 4 }, { x: L + S * 0.76, y: T - 4 },
    { x: L - 4, y: T + S * 0.8 }, { x: L - 4, y: T + S * 0.74 },
  ]);

  const bolt = buildBolt(cx, cy, boltH);
  const wordBaseline = bolt.bottom + 30 + WORD_SIZE * 0.72;
  const tagBaseline = wordBaseline + 30;

  return {
    cx, cy, S, R, L, T, I, slabRRect, slabClip, shards, cracks, dots,
    streakA, streakB, bolt, boltH, wordBaseline, tagBaseline,
    orbitRx: S * 0.5, orbitRy: S * 0.4,
  };
}

type Scene = ReturnType<typeof buildScene>;

// ---------------------------------------------------------------------------
// Sub-components (each derives its own props from `t`)
// ---------------------------------------------------------------------------

/** Frosted ice surface over the slab bounds — clip it to a slab or shard. */
const IceSurface = ({ sc }: { sc: Scene }) => (
  <>
    <Rect x={sc.L} y={sc.T} width={sc.S} height={sc.S}>
      <LinearGradient
        start={vec(sc.L, sc.T)}
        end={vec(sc.L + sc.S, sc.T + sc.S)}
        colors={["rgba(236,228,255,0.24)", "rgba(186,162,249,0.10)"]}
      />
    </Rect>
    {/* inner top-left gloss */}
    <Rect x={sc.L} y={sc.T} width={sc.S} height={sc.S}>
      <RadialGradient
        c={vec(sc.L + sc.S * 0.2, sc.T + sc.S * 0.16)}
        r={sc.S * 0.55}
        colors={["rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
      />
    </Rect>
    {/* diagonal specular streaks */}
    <Path path={sc.streakA}>
      <LinearGradient
        start={vec(sc.L + sc.S * 0.2, sc.T + sc.S * 0.2)}
        end={vec(sc.L + sc.S * 0.31, sc.T + sc.S * 0.31)}
        colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.17)", "rgba(255,255,255,0)"]}
      />
    </Path>
    <Path path={sc.streakB} color="rgba(255,255,255,0.07)" />
  </>
);

const BoltShape = ({ sc }: { sc: Scene }) => {
  const b = sc.bolt;
  return (
    <>
      <Path path={b.upper}>
        <LinearGradient start={vec(0, b.top)} end={vec(0, sc.cy + sc.boltH * 0.1)} colors={[C.gradA, C.gradB]} />
      </Path>
      <Path path={b.lower}>
        <LinearGradient start={vec(0, sc.cy - sc.boltH * 0.1)} end={vec(0, b.bottom)} colors={[C.gradB, C.deep]} />
      </Path>
      <Path path={b.middle} color={C.gradA} />
    </>
  );
};

function ShardView({ t, shard, sc }: { t: SharedValue<number>; shard: ShardData; sc: Scene }) {
  const { ox, oy, dirX, dirY, dist, rot, scaleTo, delay, dur } = shard;
  const S0 = TIMELINE.shatter + delay;
  const transform = useDerivedValue((): Transforms3d => {
    const p = easeOutCubic(seg(t.value, S0, S0 + dur));
    return [
      { translateX: ox + dirX * dist * p },
      { translateY: oy + dirY * dist * p },
      { rotate: rot * p },
      { scale: lerp(1, scaleTo, p) },
      { translateX: -ox },
      { translateY: -oy },
    ];
  });
  // Pre-shatter: warm (shards sit invisibly under the slab). After its
  // flight a shard drops to exactly 0 so Skia skips it entirely.
  const opacity = useDerivedValue(() => {
    const tv = t.value;
    if (tv < TIMELINE.shatter) return SHARD_WARM;
    if (tv >= S0 + dur) return 0;
    return Math.max(SHARD_WARM, 1 - easeInCubic(seg(tv, S0 + dur * 0.1, S0 + dur)));
  });
  // One precomputed path, fill + thin stroke, opacity as a paint prop — no
  // clip, no blur, no Group/opacity layer per shard.
  return (
    <>
      <Path path={shard.path} transform={transform} opacity={opacity}>
        <LinearGradient
          start={vec(sc.L, sc.T)}
          end={vec(sc.L + sc.S, sc.T + sc.S)}
          colors={["rgba(240,233,255,0.30)", "rgba(186,162,249,0.12)"]}
        />
      </Path>
      <Path
        path={shard.path}
        transform={transform}
        opacity={opacity}
        style="stroke"
        strokeWidth={1}
        strokeJoin="round"
        color="rgba(244,238,255,0.6)"
      />
    </>
  );
}

function CrackView({
  t, crack, slabOpacity,
}: {
  t: SharedValue<number>;
  crack: CrackData;
  slabOpacity: SharedValue<number>;
}) {
  const { start, dur, frames } = crack;
  const n = frames.length - 1;
  const full = frames[n];
  const idx = useDerivedValue(() => Math.round(n * easeOutCubic(seg(t.value, start, start + dur))));
  // Picks a precomputed trimmed path — no per-frame path allocation. Before
  // this crack starts (idx 0 = empty path) the FULL crack is drawn at WARM so
  // the BlurMask glow pipeline is compiled up front, not at crack start.
  const revealed = useDerivedValue(() => (idx.value === 0 ? full : frames[idx.value]));
  // light leaks: glow grows as the crack spreads toward the break
  const glowOpacity = useDerivedValue(() => {
    if (t.value >= TIMELINE.shatter) return 0;
    if (idx.value === 0) return WARM;
    return Math.max(
      WARM,
      slabOpacity.value * (0.35 + 0.65 * easeInCubic(seg(t.value, TIMELINE.crack[0], TIMELINE.shatter))),
    );
  });
  const coreOpacity = useDerivedValue(() => {
    if (t.value >= TIMELINE.shatter) return 0;
    if (idx.value === 0) return WARM;
    return Math.max(WARM, slabOpacity.value);
  });
  return (
    <>
      <Path
        path={revealed}
        opacity={glowOpacity}
        style="stroke"
        strokeWidth={5}
        strokeCap="round"
        strokeJoin="round"
        color={C.lavender}
      >
        <BlurMask blur={6} style="normal" />
      </Path>
      <Path
        path={revealed}
        opacity={coreOpacity}
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        strokeJoin="round"
        color={C.white}
      />
    </>
  );
}

function DotView({ t, dot, sc, index }: { t: SharedValue<number>; dot: DotData; sc: Scene; index: number }) {
  const { sx, sy, qx, qy, tx, ty, px, py, orbit, arrive } = dot;
  const { cx, cy, orbitRx, orbitRy } = sc;
  const transform = useDerivedValue((): Transforms3d => {
    const tv = t.value;
    const p = easeOutCubic(seg(tv, arrive, arrive + TIMELINE.dots.dur));
    const u = 1 - p;
    // quadratic bezier drift-in
    let x = u * u * sx + 2 * u * p * qx + p * p * tx;
    let y = u * u * sy + 2 * u * p * qy + p * p * ty;
    // lean in (tension), then get pushed out by the break
    const press = easeInOutSine(seg(tv, TIMELINE.dotsPress[0], TIMELINE.dotsPress[1])) * 3;
    const push = easeOutCubic(seg(tv, TIMELINE.shatter, TIMELINE.shatter + TIMELINE.dotsPushDur)) * 28;
    x += px * (push - press);
    y += py * (push - press);
    // settle into a slow orbit around the bolt
    const s = easeInOutCubic(seg(tv, TIMELINE.settle[0], TIMELINE.settle[1]));
    const ang = orbit + Math.max(0, tv - TIMELINE.settle[0]) * 0.00018;
    const bob = Math.sin(tv * 0.0021 + index * 1.7) * 2;
    const oxp = cx + orbitRx * Math.cos(ang);
    const oyp = cy + orbitRy * Math.sin(ang) + bob;
    return [{ translateX: lerp(x, oxp, s) }, { translateY: lerp(y, oyp, s) }];
  });
  const opacity = useDerivedValue(() => {
    const tv = t.value;
    const inA = seg(tv, arrive, arrive + TIMELINE.dots.dur * 0.45);
    const dim = easeOutCubic(seg(tv, TIMELINE.shatter, TIMELINE.shatter + 350));
    const back = easeInOutCubic(seg(tv, TIMELINE.settle[0], TIMELINE.settle[1]));
    // floor: the glow circle is drawn at 0.55 → WARM/0.55 keeps it above 0
    return Math.max(WARM / 0.55, inA * (lerp(1, 0.4, dim) + 0.3 * back));
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={0} r={11} color={dot.color} opacity={0.55}>
        <BlurMask blur={8} style="normal" />
      </Circle>
      <Circle cx={0} cy={0} r={5} color={dot.color} />
      <Circle cx={-1.5} cy={-1.6} r={1.6} color="rgba(255,255,255,0.65)" />
    </Group>
  );
}

/** `glyph` = the letter outline (precomputed) used to clip the light sweep. */
type LetterLayout = { ch: string; x: number; w: number; glyph: SkPath | null };

function LetterView({
  t, letter, index, baseline, font, reduced, sweepTransform, sweepHalfW,
}: {
  t: SharedValue<number>;
  letter: LetterLayout;
  index: number;
  baseline: number;
  font: SkFont;
  reduced: boolean;
  sweepTransform: SharedValue<Transforms3d>;
  sweepHalfW: number;
}) {
  const start = TIMELINE.letters.start + index * TIMELINE.letters.stagger;
  const lcx = letter.x + letter.w / 2;
  const lcy = baseline - WORD_SIZE * 0.36;
  const prog = useDerivedValue(() =>
    reduced
      ? easeOutCubic(seg(t.value, TIMELINE.reduced.fade[0], TIMELINE.reduced.fade[1]))
      : easeOutCubic(seg(t.value, start, start + TIMELINE.letters.dur)),
  );
  const transform = useDerivedValue((): Transforms3d => {
    const e = prog.value;
    const ty = reduced ? 0 : 14 * (1 - e);
    const s = reduced ? 1 : lerp(0.85, 1, e);
    return [
      { translateX: lcx },
      { translateY: lcy + ty },
      { scale: s },
      { translateX: -lcx },
      { translateY: -lcy },
    ];
  });
  // No wrapping opacity Group: each draw gets its own flattened paint opacity
  // (letter fade × its crossfade term), floored at WARM where it must pre-warm.
  const opacity = useDerivedValue(() => Math.min(1, prog.value * 1.25));
  // Blur-in = crossfade from a fixed-radius blurred copy to the sharp glyph
  // (an animated blur radius would rebuild the image filter every frame).
  const sharpOpacity = useDerivedValue(() => Math.max(WARM, opacity.value * (reduced ? 1 : prog.value)));
  const blurredOpacity = useDerivedValue(() => {
    if (reduced) return 0;
    const p = prog.value;
    if (p === 0) return t.value < LETTER_WARM_END ? WARM : 0; // pre-warm, then idle until its turn
    if (p >= 1) return 0; // fully resolved → skip the filter layer entirely
    return opacity.value * (1 - p);
  });
  const sweepOpacity = useDerivedValue(() =>
    t.value < LETTER_WARM_END ? Math.max(WARM, opacity.value) : opacity.value,
  );
  const fill = (
    <LinearGradient
      start={vec(0, baseline - WORD_SIZE * 0.74)}
      end={vec(0, baseline)}
      colors={[C.white, "#E4D9FC"]}
    />
  );
  return (
    <Group transform={transform}>
      {!reduced && (
        <Text x={letter.x} y={baseline} text={letter.ch} font={font} opacity={blurredOpacity}>
          {fill}
          <Blur blur={6} />
        </Text>
      )}
      <Text x={letter.x} y={baseline} text={letter.ch} font={font} opacity={sharpOpacity}>
        {fill}
      </Text>
      {!reduced && letter.glyph && (
        // Light sweep: a static gradient band, translated (never rebuilt) and
        // clipped to this glyph's precomputed outline.
        <Group clip={letter.glyph}>
          <Group transform={sweepTransform}>
            <Rect
              x={-sweepHalfW}
              y={baseline - WORD_SIZE}
              width={sweepHalfW * 2}
              height={WORD_SIZE + 12}
              opacity={sweepOpacity}
            >
              <LinearGradient
                start={vec(-22, baseline - 38)}
                end={vec(22, baseline + 4)}
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.95)", "rgba(255,255,255,0)"]}
              />
            </Rect>
          </Group>
        </Group>
      )}
    </Group>
  );
}

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
   * heavy first mount (screens, their Skia backgrounds) never lands mid-shatter.
   */
  canStart?: boolean;
};

function IntroSplash({ onStart, onComplete, canStart = true }: IntroSplashProps) {
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const sc = useMemo(() => buildScene(W, H), [W, H]);

  const wordFont = useFont(Inter_800ExtraBold, WORD_SIZE);
  const tagFont = useFont(Inter_500Medium, TAG_SIZE);

  // Per-letter layout, measured from real glyph advances. Glyph outlines for
  // the sweep clip are built here once, never on the UI thread.
  const letters = useMemo<{ items: LetterLayout[]; x0: number; width: number } | null>(() => {
    if (!wordFont) return null;
    const widths = wordFont.getGlyphWidths(wordFont.getGlyphIDs(WORDMARK));
    const total = widths.reduce((s, w) => s + w, 0) + LETTER_SPACING * (widths.length - 1);
    let x = sc.cx - total / 2;
    const items = WORDMARK.split("").map((ch, i): LetterLayout => {
      const item = { ch, x, w: widths[i] ?? 0, glyph: Skia.Path.MakeFromText(ch, x, sc.wordBaseline, wordFont) };
      x += (widths[i] ?? 0) + LETTER_SPACING;
      return item;
    });
    return { items, x0: sc.cx - total / 2, width: total };
  }, [wordFont, sc.cx, sc.wordBaseline]);

  const tagX = useMemo(() => {
    if (!tagFont) return 0;
    const w = tagFont.getGlyphWidths(tagFont.getGlyphIDs(TAGLINE)).reduce((s, v) => s + v, 0);
    return sc.cx - w / 2;
  }, [tagFont, sc.cx]);

  // ---- the master clock ----
  // `t` only starts once the canvas can really paint: fonts loaded (or the
  // fallback elapsed) + the Canvas laid out + two rAF ticks. Until then t = 0,
  // where every layer is at its WARM (invisible) opacity — the pre-start wait
  // doubles as Skia pipeline warm-up. `gate` only guards onComplete.
  const t = useSharedValue(0);
  const gate = useSharedValue(0);
  const totalMs = useSharedValue<number>(TIMELINE.total);

  const onStartRef = useRef(onStart);
  const onCompleteRef = useRef(onComplete);
  onStartRef.current = onStart;
  onCompleteRef.current = onComplete;

  const [fontsReady, setFontsReady] = useState(false);
  const [laidOut, setLaidOut] = useState(false);
  const startedRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (wordFont && tagFont) setFontsReady(true);
  }, [wordFont, tagFont]);
  useEffect(() => {
    const id = setTimeout(() => setFontsReady(true), FONT_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

  const [readyFallback, setReadyFallback] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReadyFallback(true), APP_READY_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);
  const appGate = canStart || readyFallback;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setLaidOut(true);
  }, []);

  useEffect(() => {
    if (!fontsReady || !laidOut || !appGate || startedRef.current) return;
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
  }, [fontsReady, laidOut, appGate, reduced, t, gate, totalMs]);

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

  // Haptic exactly once, one frame (~17ms) AFTER the shatter moment so the JS
  // bridge call never competes with the heaviest render frame.
  useAnimatedReaction(
    () => t.value >= TIMELINE.shatter + 17,
    (now, prev) => {
      if (!reduced && now && !prev) scheduleOnRN(fireHaptic);
    },
    [reduced],
  );

  const { cx, cy, S, L, T } = sc;
  const I = { x: sc.I.x, y: sc.I.y };
  const Ix = sc.I.x;
  const Iy = sc.I.y;
  const SH = TIMELINE.shatter;

  // ---- background ----
  const bgGlowOpacity = useDerivedValue(() => {
    const tv = t.value;
    const inA = easeOutCubic(seg(tv, TIMELINE.slabIn[0], TIMELINE.slabIn[1]));
    const leak = seg(tv, TIMELINE.crack[0], SH);
    const breathe = 0.06 * Math.sin(tv * 0.0016);
    return Math.max(WARM, inA * Math.min(1, 0.7 + 0.3 * leak + breathe));
  });
  const prePulse = useDerivedValue(() =>
    t.value >= TIMELINE.prePulse[1]
      ? 0
      : Math.max(WARM, 0.06 * Math.sin(Math.PI * seg(t.value, TIMELINE.prePulse[0], TIMELINE.prePulse[1]))),
  );

  // ---- slab ----
  const slabIn = useDerivedValue(() => easeOutCubic(seg(t.value, TIMELINE.slabIn[0], TIMELINE.slabIn[1])));
  const slabTransform = useDerivedValue((): Transforms3d => {
    const tv = t.value;
    const s = lerp(0.94, 1, slabIn.value);
    const k = seg(tv, TIMELINE.tension[0], TIMELINE.tension[1]);
    const env = k < 0.25 ? k / 0.25 : (1 - k) / 0.75; // quick rise, decay to 0 at the break
    const dx = 2.6 * env * Math.sin(tv * 0.11);
    const dy = 1.6 * env * Math.sin(tv * 0.137 + 1.3);
    return [
      { translateX: cx + dx },
      { translateY: cy + dy },
      { scale: s },
      { translateX: -cx },
      { translateY: -cy },
    ];
  });
  // Slab family: floored at WARM until the break, then exactly 0 (skipped).
  const slabOpacity = useDerivedValue(() => (t.value >= SH ? 0 : slabIn.value));
  const slabSurfaceOpacity = useDerivedValue(() => (t.value >= SH ? 0 : Math.max(WARM, slabIn.value)));
  const slabShadowOpacity = useDerivedValue(() => {
    const v = slabIn.value * (1 - easeOutCubic(seg(t.value, SH, SH + 260)));
    return t.value >= SH + 260 ? 0 : Math.max(WARM / 0.42, v);
  });
  const frozenBoltOpacity = useDerivedValue(() =>
    t.value >= SH + 120 ? 0 : Math.max(WARM, slabIn.value * 0.25 * (1 - seg(t.value, SH, SH + 120))),
  );
  const impactGlowOpacity = useDerivedValue(() =>
    t.value >= SH ? 0 : Math.max(WARM, slabIn.value * 0.9 * easeInCubic(seg(t.value, TIMELINE.crack[0], SH))),
  );

  // ---- shatter: bloom + shockwave ----
  // Bloom: a fixed-radius radial gradient scaled up via transform (animating
  // the gradient radius would rebuild the shader every frame).
  const BLOOM_R = W * 0.7;
  const bloomP = useDerivedValue(() => seg(t.value, SH, SH + TIMELINE.bloomDur));
  // Pre-shatter both are drawn full-size at WARM (pipeline warm-up); after
  // their window they drop to exactly 0. No blur filters — gradient only.
  const bloomTransform = useDerivedValue((): Transforms3d => {
    const s = t.value < SH ? 1 : Math.max(0.002, easeOutCubic(bloomP.value));
    return [{ translateX: Ix }, { translateY: Iy }, { scale: s }, { translateX: -Ix }, { translateY: -Iy }];
  });
  const bloomOpacity = useDerivedValue(() => {
    const tv = t.value;
    if (tv < SH) return WARM;
    if (tv >= SH + TIMELINE.bloomDur) return 0;
    return Math.max(WARM, 0.55 * (1 - easeOutCubic(bloomP.value)));
  });
  const ringP = useDerivedValue(() => easeOutCubic(seg(t.value, SH, SH + TIMELINE.ringDur)));
  const ringR = useDerivedValue(() => (t.value < SH ? W * 0.3 : Math.max(1, W * 0.62 * ringP.value)));
  const ringWidth = useDerivedValue(() => 0.5 + 2.2 * (1 - ringP.value));
  const ringOpacity = useDerivedValue(() => {
    const tv = t.value;
    if (tv < SH) return WARM;
    if (tv >= SH + TIMELINE.ringDur) return 0;
    return Math.max(WARM, 0.7 * (1 - ringP.value));
  });

  // ---- bolt ----
  const boltIn = useDerivedValue(() =>
    reduced
      ? easeOutCubic(seg(t.value, TIMELINE.reduced.fade[0], TIMELINE.reduced.fade[1]))
      : easeOutCubic(seg(t.value, TIMELINE.bolt[0], TIMELINE.bolt[0] + 180)),
  );
  const boltTransform = useDerivedValue((): Transforms3d => {
    const tv = t.value;
    let s = 1;
    if (!reduced) {
      s =
        tv < TIMELINE.boltOvershootAt
          ? lerp(0.6, 1.08, easeOutCubic(seg(tv, TIMELINE.bolt[0], TIMELINE.boltOvershootAt)))
          : lerp(1.08, 1, easeInOutSine(seg(tv, TIMELINE.boltOvershootAt, TIMELINE.bolt[1])));
    }
    return [{ translateX: cx }, { translateY: cy }, { scale: s }, { translateX: -cx }, { translateY: -cy }];
  });
  const boltGlowOpacity = useDerivedValue(() => {
    const tv = t.value;
    if (reduced) return 0.45 * boltIn.value;
    const [b0] = TIMELINE.bolt;
    let g = 0;
    if (tv < b0 + 250) g = 0.8 * easeOutCubic(seg(tv, b0, b0 + 250));
    else if (tv < TIMELINE.bolt[1]) g = lerp(0.8, 0.45, easeInOutSine(seg(tv, b0 + 250, TIMELINE.bolt[1])));
    else g = 0.45 + 0.28 * Math.sin(Math.PI * seg(tv, TIMELINE.glowPulse[0], TIMELINE.glowPulse[1]));
    // idle breathing after the pulse (amplitude eases in, no jump)
    const idleAmp = 0.07 * seg(tv, TIMELINE.glowPulse[1], TIMELINE.glowPulse[1] + 600);
    return Math.max(WARM, g + idleAmp * Math.sin((tv - TIMELINE.glowPulse[1]) * 0.0024));
  });
  const boltOpacity = useDerivedValue(() => Math.max(WARM, boltIn.value));
  const boltShadowOpacity = useDerivedValue(() => Math.max(WARM / 0.55, boltIn.value));

  // ---- wordmark sweep (shared by every letter) ----
  // A static gradient band centered at local x=0, translated across the word.
  const wordX0 = letters?.x0 ?? 0;
  const wordW = letters?.width ?? 0;
  const sweepHalfW = wordW + 160;
  const sweepTransform = useDerivedValue((): Transforms3d => {
    const p = easeInOutSine(seg(t.value, TIMELINE.sweep[0], TIMELINE.sweep[1]));
    return [{ translateX: lerp(wordX0 - 70, wordX0 + wordW + 70, p) }];
  });

  // ---- tagline ----
  const tagP = useDerivedValue(() =>
    reduced
      ? easeOutCubic(seg(t.value, TIMELINE.reduced.fade[0] + 100, TIMELINE.reduced.fade[1] + 200))
      : easeOutCubic(seg(t.value, TIMELINE.tagline[0], TIMELINE.tagline[1])),
  );
  const tagTransform = useDerivedValue((): Transforms3d => [{ translateY: reduced ? 0 : 8 * (1 - tagP.value) }]);
  const tagOpacity = useDerivedValue(() => Math.max(WARM, tagP.value));

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={handleLayout}>
      {/* Background */}
      <Rect x={0} y={0} width={W} height={H}>
        <LinearGradient start={vec(0, 0)} end={vec(0, H)} colors={[C.bgTop, C.bgBottom]} />
      </Rect>
      {/* Everything else is mounted up front and, while t === 0 (pre-start
          wait), drawn at WARM opacity so every pipeline (blur masks, filters,
          gradients, shards, bloom, ring) is compiled before the clock runs.
          No outer gate Group: nested opacities would multiply WARM below the
          point where Skia skips the draw. */}
      <Group opacity={bgGlowOpacity}>
        <Circle cx={cx} cy={cy} r={W * 0.95}>
          <RadialGradient c={vec(cx, cy)} r={W * 0.95} colors={["rgba(186,162,249,0.14)", "rgba(186,162,249,0)"]} />
        </Circle>
      </Group>

      {!reduced && (
        <>
          {/* Slab drop shadow */}
          <Group opacity={slabShadowOpacity} transform={slabTransform}>
            <RoundedRect x={L} y={T + 12} width={S} height={S} r={sc.R} color="rgba(82,64,168,0.42)">
              <BlurMask blur={22} style="normal" />
            </RoundedRect>
          </Group>

          {/* Ice slab (with frozen bolt + cracks) */}
          <Group transform={slabTransform}>
            <Group clip={sc.slabClip} opacity={slabSurfaceOpacity}>
              <IceSurface sc={sc} />
            </Group>
            <Group opacity={frozenBoltOpacity}>
              <BoltShape sc={sc} />
            </Group>
            <RoundedRect
              x={L + 0.5}
              y={T + 0.5}
              width={S - 1}
              height={S - 1}
              r={sc.R}
              style="stroke"
              strokeWidth={1}
              color="rgba(244,238,255,0.55)"
              opacity={slabOpacity}
            />
            <Circle cx={I.x} cy={I.y} r={S * 0.38} opacity={impactGlowOpacity}>
              <RadialGradient c={vec(I.x, I.y)} r={S * 0.38} colors={["rgba(214,196,250,0.5)", "rgba(214,196,250,0)"]} />
            </Circle>
            {sc.cracks.map((c, i) => (
              <CrackView key={i} t={t} crack={c} slabOpacity={slabOpacity} />
            ))}
          </Group>

          {/* Shards (warm-invisible under the slab until the break) */}
          {sc.shards.map((s, i) => (
            <ShardView key={i} t={t} shard={s} sc={sc} />
          ))}

          {/* Pre-break brightness micro-pulse */}
          <Rect x={0} y={0} width={W} height={H} color={C.gradA} opacity={prePulse} />

          {/* Bloom flash (precomputed radial gradient, scaled) + shockwave */}
          <Circle cx={I.x} cy={I.y} r={BLOOM_R} opacity={bloomOpacity} transform={bloomTransform}>
            <RadialGradient
              c={vec(I.x, I.y)}
              r={BLOOM_R}
              colors={["rgba(255,255,255,1)", "rgba(186,162,249,0.55)", "rgba(186,162,249,0)"]}
            />
          </Circle>
          <Circle cx={I.x} cy={I.y} r={ringR} style="stroke" strokeWidth={ringWidth} color={C.gradA} opacity={ringOpacity} />
        </>
      )}

      {/* Bolt: glow + facets */}
      <Group transform={boltTransform}>
        <Path path={sc.bolt.silhouette} color={C.lavender} opacity={boltGlowOpacity}>
          <BlurMask blur={18} style="normal" />
        </Path>
        <Path
          path={sc.bolt.silhouette}
          color="rgba(82,64,168,0.55)"
          transform={[{ translateY: 5 }]}
          opacity={boltShadowOpacity}
        >
          <BlurMask blur={8} style="normal" />
        </Path>
        <Group opacity={boltOpacity}>
          <BoltShape sc={sc} />
        </Group>
      </Group>

      {/* Player dots */}
      {!reduced && sc.dots.map((d, i) => <DotView key={i} t={t} dot={d} sc={sc} index={i} />)}

      {/* Wordmark (renders once the font is loaded) */}
      {wordFont &&
        letters &&
        letters.items.map((l, i) => (
          <LetterView
            key={i}
            t={t}
            letter={l}
            index={i}
            baseline={sc.wordBaseline}
            font={wordFont}
            reduced={reduced}
            sweepTransform={sweepTransform}
            sweepHalfW={sweepHalfW}
          />
        ))}

      {/* Tagline */}
      {tagFont && (
        <Text
          x={tagX}
          y={sc.tagBaseline}
          text={TAGLINE}
          font={tagFont}
          color="rgba(186,162,249,0.8)"
          opacity={tagOpacity}
          transform={tagTransform}
        />
      )}
    </Canvas>
  );
}

export default memo(IntroSplash);
