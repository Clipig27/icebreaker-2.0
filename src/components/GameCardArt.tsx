import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Polygon,
  Polyline,
  Rect,
  Stop,
} from "react-native-svg";
import type { GameType } from "../stores/roomStore";

/* ------------------------------------------------------------------ */
/* Theme                                                                */
/* ------------------------------------------------------------------ */

type Ray = { points: string; color: string; opacity: number };

export type CardTheme = {
  /** Diagonal background gradient (top-left → bottom-right). */
  bg: readonly [string, string];
  /** Card border colour (already includes alpha). */
  border: string;
  /** Main accent: pill text, play button, accents. */
  accent: string;
  /** Pill text colour. */
  text: string;
  /** Translucent angled light bands, in a 0–100 × 0–100 stretched space. */
  rays: Ray[];
};

export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const CARD_THEMES: Record<GameType, CardTheme> = {
  talentShow: {
    bg: ["#3A1F35", "#5A2540"],
    border: withAlpha("#F5C842", 0.45),
    accent: "#F5C842",
    text: "#F5C842",
    rays: [
      { points: "62,0 82,0 64,100 44,100", color: "#E0457B", opacity: 0.2 },
      { points: "86,0 100,0 100,100 72,100", color: "#E0457B", opacity: 0.1 },
    ],
  },
  numberGuessor: {
    bg: ["#16263A", "#1E3448"],
    border: withAlpha("#7FE0D6", 0.4),
    accent: "#8FE3DA",
    text: "#8FE3DA",
    rays: [{ points: "70,0 100,0 100,100 56,100", color: "#7FE0D6", opacity: 0.05 }],
  },
  pieCharts: {
    bg: ["#3A2230", "#4A2A3A"],
    border: withAlpha("#F2A7BE", 0.4),
    accent: "#F2A7BE",
    text: "#F2A7BE",
    rays: [
      { points: "64,0 82,0 72,100 52,100", color: "#C2456E", opacity: 0.18 },
      { points: "86,0 100,0 100,100 78,100", color: "#F2A7BE", opacity: 0.05 },
    ],
  },
  potLuck: {
    bg: ["#2B3A2E", "#334433"],
    border: withAlpha("#A8D5A2", 0.5),
    accent: "#F0C66A",
    text: "#F0C66A",
    rays: [{ points: "74,0 100,0 100,100 84,100", color: "#A8D5A2", opacity: 0.08 }],
  },
  blindRanking: {
    bg: ["#2E2A5A", "#3B3570"],
    border: withAlpha("#C9B8FF", 0.45),
    accent: "#C9B8FF",
    text: "#C9B8FF",
    rays: [
      { points: "64,0 82,0 70,100 50,100", color: "#C9B8FF", opacity: 0.1 },
      { points: "86,0 100,0 100,100 76,100", color: "#C9B8FF", opacity: 0.05 },
    ],
  },
  tenSecondTasks: {
    bg: ["#3A2020", "#4A2826"],
    border: withAlpha("#F2A27A", 0.4),
    accent: "#F2A27A",
    text: "#F2A27A",
    rays: [{ points: "72,0 100,0 100,100 62,100", color: "#F2A27A", opacity: 0.08 }],
  },
  auctionDraft: {
    bg: ["#1F3A2E", "#264535"],
    border: withAlpha("#C8E89A", 0.4),
    accent: "#C8E89A",
    text: "#C8E89A",
    rays: [
      { points: "68,0 86,0 72,100 54,100", color: "#C8E89A", opacity: 0.07 },
      { points: "88,0 100,0 100,100 78,100", color: "#C8E89A", opacity: 0.05 },
    ],
  },
  blindSpot: {
    bg: ["#0F1A1A", "#162626"],
    border: withAlpha("#4ECDC4", 0.4),
    accent: "#4ECDC4",
    text: "#4ECDC4",
    rays: [
      { points: "66,0 84,0 70,100 52,100", color: "#4ECDC4", opacity: 0.08 },
      { points: "88,0 100,0 100,100 78,100", color: "#4ECDC4", opacity: 0.05 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Background (gradient + light rays)                                   */
/* ------------------------------------------------------------------ */

export const GameCardBackground = memo(function GameCardBackground({ theme }: { theme: CardTheme }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={theme.bg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        {theme.rays.map((r, i) => (
          <Polygon key={i} points={r.points} fill={r.color} fillOpacity={r.opacity} />
        ))}
      </Svg>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Geometry helpers (computed once at module load)                      */
/* ------------------------------------------------------------------ */

const O = "#1A1420"; // sticker outline
const SW = 2.8;

function starPath(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

/** Pie slice from angle a0 → a1 (degrees, 0 = 12 o'clock, clockwise). */
function slicePath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${cx} ${cy} L${p(a0)} A${r} ${r} 0 ${large} 1 ${p(a1)} Z`;
}

/** Arc stroke path from a0 → a1 (degrees, 0 = 12 o'clock, clockwise). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0)} A${r} ${r} 0 ${large} 1 ${p(a1)}`;
}

const STAR = starPath(68, 72, 38, 17);
const STAR_SHINE = "M56 60 L63 50";
const QMARK = "M-11 -12 C-11 -26 11 -26 11 -12 C11 -3 0 -3 0 9";

const PIE = { cx: 78, cy: 94, r: 32 };
const PIE_SLICES: { d: string; fill: string }[] = [
  { d: slicePath(PIE.cx, PIE.cy, PIE.r, 0, 115), fill: "#F7C9D6" },
  { d: slicePath(PIE.cx, PIE.cy, PIE.r, 115, 215), fill: "#E07FA0" },
  { d: slicePath(PIE.cx, PIE.cy, PIE.r, 215, 300), fill: "#F2A7BE" },
  { d: slicePath(PIE.cx, PIE.cy, PIE.r, 300, 360), fill: "#C9577F" },
];

const RING_ARC = arcPath(78, 92, 44, 40, 330);
const RING_ARC_OUTER = arcPath(78, 92, 54, 300, 350);

function scallops(x0: number, x1: number, y: number, w: number, depth: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += w) d += ` q${w / 2} ${depth} ${w} 0`;
  return d;
}
const POT_DRIPS = `${scallops(40, 110, 104, 10, 12)} L110 100 L40 100 Z`;

/* ------------------------------------------------------------------ */
/* Illustrations (viewBox 150 × 200, right side of the card)            */
/* ------------------------------------------------------------------ */

type DashSpec = [number, number, number, number, string];
function Dashes({ list, width = 3 }: { list: DashSpec[]; width?: number }) {
  return (
    <>
      {list.map(([x1, y1, x2, y2, c], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={width} strokeLinecap="round" />
      ))}
    </>
  );
}

function TalentArt() {
  return (
    <>
      <Defs>
        <SvgGradient id="ngtStar" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFE58A" />
          <Stop offset="1" stopColor="#F2B62C" />
        </SvgGradient>
        <SvgGradient id="ngtDome" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF7FA0" />
          <Stop offset="1" stopColor="#E0405F" />
        </SvgGradient>
      </Defs>
      <G transform="rotate(-8 68 72)">
        <Path d={STAR} fill="url(#ngtStar)" stroke={O} strokeWidth={SW + 0.4} strokeLinejoin="round" />
        <Path d={STAR_SHINE} stroke="#FFF6D0" strokeWidth={4} strokeLinecap="round" />
      </G>
      {/* buzzer */}
      <Rect x={44} y={130} width={56} height={12} rx={5} fill="#D9A53A" stroke={O} strokeWidth={SW} />
      <Rect x={50} y={124} width={44} height={9} rx={3} fill="#F5C842" stroke={O} strokeWidth={SW} />
      <Path d="M52 124 A20 17 0 0 1 92 124 Z" fill="url(#ngtDome)" stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M60 116 Q64 110 71 109" stroke="#FFD3DE" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Dashes
        list={[
          [112, 46, 122, 40, "#F5C842"],
          [116, 74, 128, 76, "#F5C842"],
          [24, 40, 30, 48, "#F5C842"],
          [104, 108, 112, 114, "#F27BA8"],
          [20, 96, 26, 92, "#F27BA8"],
          [38, 22, 40, 30, "#F27BA8"],
        ]}
      />
    </>
  );
}

function NumberArt() {
  return (
    <>
      {/* circuit backdrop */}
      <G stroke="#7FE0D6" strokeOpacity={0.18} strokeWidth={1.5} fill="none">
        <Polyline points="0,40 30,40 44,26 150,26" />
        <Polyline points="150,60 136,60 128,52" />
        <Polyline points="0,150 26,150 40,164 150,164" />
        <Polyline points="150,128 138,140 138,190" />
        <Line x1={118} y1={0} x2={118} y2={26} />
        <Line x1={20} y1={150} x2={20} y2={200} />
      </G>
      <G fill="#7FE0D6" fillOpacity={0.35}>
        <Circle cx={44} cy={26} r={2.5} />
        <Circle cx={128} cy={52} r={2.5} />
        <Circle cx={40} cy={164} r={2.5} />
        <Circle cx={138} cy={140} r={2.5} />
      </G>
      {/* dial */}
      <Circle cx={78} cy={92} r={44} fill="#1B3A4C" stroke={O} strokeWidth={SW} />
      <Circle cx={78} cy={92} r={33} fill="none" stroke="#7FE0D6" strokeOpacity={0.35} strokeWidth={2} />
      <Path d={RING_ARC} stroke={O} strokeWidth={14} strokeLinecap="round" fill="none" />
      <Path d={RING_ARC} stroke="#7FE0D6" strokeWidth={8} strokeLinecap="round" fill="none" />
      <Path d={RING_ARC_OUTER} stroke="#5AA8F0" strokeWidth={5} strokeLinecap="round" fill="none" />
      <G transform="translate(78 92)">
        <Path d={QMARK} stroke={O} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path d={QMARK} stroke="#E8FFFB" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Circle cx={0} cy={22} r={6.5} fill="#E8FFFB" stroke={O} strokeWidth={SW} />
      </G>
      <Dashes
        list={[
          [128, 96, 136, 96, "#7FE0D6"],
          [22, 76, 26, 70, "#5AA8F0"],
        ]}
      />
    </>
  );
}

function PieArt() {
  const { cx, cy } = PIE;
  return (
    <>
      <Circle cx={cx} cy={cy} r={62} fill="#F2A7BE" fillOpacity={0.05} />
      <Circle cx={cx} cy={cy} r={52} fill="#F2A7BE" fillOpacity={0.06} />
      {/* rim + face */}
      <Circle cx={cx} cy={cy} r={42} fill="#F0C66A" stroke={O} strokeWidth={SW} />
      <Circle cx={cx} cy={cy} r={PIE.r} fill="#F7C9D6" stroke={O} strokeWidth={SW} />
      {PIE_SLICES.map((s, i) => (
        <Path key={i} d={s.d} fill={s.fill} stroke={O} strokeWidth={2} strokeLinejoin="round" />
      ))}
      <Path d="M48 74 A38 38 0 0 1 64 58" stroke="#FFF0C4" strokeWidth={3} strokeLinecap="round" fill="none" />
      {/* pointer */}
      <Path d="M84 40 L100 46 L90 58 Z" fill="#F5C842" stroke={O} strokeWidth={SW} strokeLinejoin="round" />
      {/* speech bubble */}
      <Path
        d="M14 118 h34 a9 9 0 0 1 9 9 v10 a9 9 0 0 1 -9 9 h-22 l-8 7 v-7 h-4 a9 9 0 0 1 -9 -9 v-10 a9 9 0 0 1 9 -9 Z"
        fill="#F29A5A"
        stroke={O}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Circle cx={22} cy={132} r={2.6} fill={O} />
      <Circle cx={31} cy={132} r={2.6} fill={O} />
      <Circle cx={40} cy={132} r={2.6} fill={O} />
      <Dashes
        list={[
          [122, 70, 130, 66, "#F2A7BE"],
          [126, 112, 134, 116, "#F0C66A"],
          [28, 84, 34, 88, "#F2A7BE"],
        ]}
      />
    </>
  );
}

function PotArt() {
  return (
    <>
      <Defs>
        <SvgGradient id="potBody" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE19A" />
          <Stop offset="1" stopColor="#E3A845" />
        </SvgGradient>
      </Defs>
      {/* steam + bubbles */}
      <Path d="M98 68 c7 -6 -5 -12 2 -18 c5 -4 0 -8 0 -8" stroke="#A8D5A2" strokeOpacity={0.6} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Path d="M52 70 c-6 -5 4 -10 -1 -15" stroke="#A8D5A2" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" fill="none" />
      <Circle cx={66} cy={78} r={7} fill="#A8D5A2" stroke={O} strokeWidth={2.2} />
      <Circle cx={84} cy={60} r={10} fill="#8CCB7E" stroke={O} strokeWidth={2.2} />
      <Circle cx={68} cy={42} r={5.5} fill="#A8D5A2" stroke={O} strokeWidth={2.2} />
      <Circle cx={81} cy={57} r={2.5} fill="#E4F7DE" />
      <Circle cx={64} cy={76} r={1.8} fill="#E4F7DE" />
      {/* pot */}
      <Path
        d="M38 104 C34 140 52 156 75 156 C98 156 116 140 112 104 Z"
        fill="url(#potBody)"
        stroke={O}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <Path d="M44 116 C44 130 50 140 58 145" stroke="#FFF2C8" strokeWidth={3.5} strokeLinecap="round" fill="none" />
      <Path d={POT_DRIPS} fill="#D9A441" stroke={O} strokeWidth={2.2} strokeLinejoin="round" />
      <Rect x={32} y={92} width={86} height={12} rx={6} fill="#F0C66A" stroke={O} strokeWidth={SW} />
      <Ellipse cx={75} cy={93} rx={34} ry={4.5} fill="#8CCB7E" stroke={O} strokeWidth={2} />
      <Dashes
        list={[
          [124, 82, 132, 78, "#F0C66A"],
          [22, 120, 28, 126, "#A8D5A2"],
          [118, 40, 124, 46, "#A8D5A2"],
        ]}
      />
    </>
  );
}

function PlusSign({ x, y, s = 6, c }: { x: number; y: number; s?: number; c: string }) {
  return (
    <G stroke={c} strokeWidth={3} strokeLinecap="round">
      <Line x1={x - s} y1={y} x2={x + s} y2={y} />
      <Line x1={x} y1={y - s} x2={x} y2={y + s} />
    </G>
  );
}

function BlindArt() {
  return (
    <>
      <Defs>
        <SvgGradient id="brFront" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#DCD0FF" />
          <Stop offset="1" stopColor="#B6A0F5" />
        </SvgGradient>
      </Defs>
      <G transform="rotate(14 92 92)">
        <Rect x={64} y={50} width={56} height={80} rx={9} fill="#8E79DC" stroke={O} strokeWidth={SW} />
        <Rect x={71} y={57} width={42} height={66} rx={6} fill="none" stroke="#C9B8FF" strokeOpacity={0.5} strokeWidth={2} />
      </G>
      <G transform="rotate(-8 64 96)">
        <Rect x={34} y={52} width={60} height={86} rx={10} fill="url(#brFront)" stroke={O} strokeWidth={SW} />
        <Rect x={41} y={59} width={46} height={72} rx={7} fill="none" stroke="#F1ECFF" strokeOpacity={0.7} strokeWidth={2} />
        <G transform="translate(64 92)">
          <Path d={QMARK} stroke="#2E2A5A" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Circle cx={0} cy={22} r={5} fill="#2E2A5A" />
        </G>
      </G>
      <PlusSign x={22} y={44} c="#C9B8FF" />
      <PlusSign x={130} y={128} c="#C9B8FF" />
      <PlusSign x={124} y={30} s={4} c="#9F8BE8" />
      <Polyline
        points="14,160 24,152 34,160 44,152 54,160 64,152"
        stroke="#C9B8FF"
        strokeOpacity={0.7}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function TimerArt() {
  const cx = 88;
  const cy = 100;
  return (
    <>
      <Defs>
        <SvgGradient id="tsRim" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFC29E" />
          <Stop offset="1" stopColor="#E9845A" />
        </SvgGradient>
      </Defs>
      {/* speed lines */}
      <Dashes
        width={4}
        list={[
          [4, 72, 36, 72, withAlpha("#F2A27A", 0.55)],
          [14, 88, 40, 88, withAlpha("#D9534F", 0.6)],
          [0, 112, 34, 112, withAlpha("#F2A27A", 0.4)],
          [10, 128, 38, 128, withAlpha("#D9534F", 0.5)],
          [24, 50, 50, 50, withAlpha("#F2A27A", 0.35)],
        ]}
      />
      {/* crown + side button */}
      <Rect x={82} y={52} width={12} height={10} rx={2} fill="#F2A27A" stroke={O} strokeWidth={SW} />
      <Rect x={76} y={44} width={24} height={9} rx={4} fill="#F2A27A" stroke={O} strokeWidth={SW} />
      <G transform={`rotate(42 ${cx} ${cy})`}>
        <Rect x={cx - 5} y={cy - 52} width={10} height={10} rx={2} fill="#E9845A" stroke={O} strokeWidth={SW} />
      </G>
      {/* body */}
      <Circle cx={cx} cy={cy} r={42} fill="url(#tsRim)" stroke={O} strokeWidth={SW} />
      <Circle cx={cx} cy={cy} r={31} fill="#FFF1E0" stroke={O} strokeWidth={2.2} />
      <G stroke={O} strokeWidth={2.5} strokeLinecap="round">
        <Line x1={cx} y1={cy - 27} x2={cx} y2={cy - 22} />
        <Line x1={cx + 27} y1={cy} x2={cx + 22} y2={cy} />
        <Line x1={cx} y1={cy + 27} x2={cx} y2={cy + 22} />
        <Line x1={cx - 27} y1={cy} x2={cx - 22} y2={cy} />
      </G>
      <Path d={arcPath(cx, cy, 24, 0, 60)} stroke="#F2A27A" strokeOpacity={0.5} strokeWidth={6} fill="none" />
      <G stroke={O} strokeWidth={3.5} strokeLinecap="round">
        <Line x1={cx} y1={cy} x2={cx} y2={cy - 20} />
        <Line x1={cx} y1={cy} x2={cx + 14} y2={cy + 8} />
      </G>
      <Circle cx={cx} cy={cy} r={4} fill="#D9534F" stroke={O} strokeWidth={2} />
      <Path d={arcPath(cx, cy, 37, 290, 330)} stroke="#FFE1CC" strokeWidth={3} strokeLinecap="round" fill="none" />
      <Dashes
        list={[
          [136, 66, 142, 60, "#F2A27A"],
          [138, 100, 146, 100, "#F2A27A"],
          [134, 132, 140, 138, "#F2A27A"],
        ]}
      />
    </>
  );
}

function Coin({ x, y }: { x: number; y: number }) {
  return (
    <>
      <Path
        d={`M${x - 20} ${y} v7 a20 6 0 0 0 40 0 v-7`}
        fill="#D9A441"
        stroke={O}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Ellipse cx={x} cy={y} rx={20} ry={6} fill="#F5C842" stroke={O} strokeWidth={2.2} />
    </>
  );
}

function BidArt() {
  return (
    <>
      <Ellipse cx={72} cy={158} rx={40} ry={7} fill="#0E1A14" fillOpacity={0.35} />
      {/* coin stack */}
      <Coin x={74} y={146} />
      <Coin x={72} y={137} />
      <Coin x={75} y={128} />
      {/* gavel */}
      <G transform="rotate(-32 62 82)">
        <Rect x={57} y={80} width={11} height={58} rx={4} fill="#B57A48" stroke={O} strokeWidth={SW} />
        <Line x1={60.5} y1={88} x2={60.5} y2={130} stroke="#D9A274" strokeWidth={2.5} strokeLinecap="round" />
        <Rect x={36} y={58} width={54} height={26} rx={7} fill="#8FCB6A" stroke={O} strokeWidth={SW} />
        <Rect x={44} y={58} width={7} height={26} fill="#6FAE4E" stroke={O} strokeWidth={2} />
        <Rect x={75} y={58} width={7} height={26} fill="#6FAE4E" stroke={O} strokeWidth={2} />
        <Line x1={54} y1={64} x2={72} y2={64} stroke="#D4F2B8" strokeWidth={3} strokeLinecap="round" />
      </G>
      {/* big coin */}
      <Circle cx={112} cy={56} r={18} fill="#F5C842" stroke={O} strokeWidth={SW} />
      <Circle cx={112} cy={56} r={12} fill="none" stroke="#D9A441" strokeWidth={3} />
      <Path d="M104 50 A10 10 0 0 1 110 46" stroke="#FFF3C4" strokeWidth={2.5} strokeLinecap="round" fill="none" />
      <Dashes
        list={[
          [132, 30, 138, 24, "#F5C842"],
          [138, 46, 146, 44, "#F5C842"],
          [24, 118, 30, 124, "#C8E89A"],
          [132, 92, 138, 96, "#C8E89A"],
        ]}
      />
    </>
  );
}

const ART: Record<GameType, () => React.JSX.Element> = {
  talentShow: TalentArt,
  numberGuessor: NumberArt,
  pieCharts: PieArt,
  potLuck: PotArt,
  blindRanking: BlindArt,
  tenSecondTasks: TimerArt,
  auctionDraft: BidArt,
};

export const GameCardIllustration = memo(function GameCardIllustration({ id }: { id: GameType }) {
  const Art = ART[id];
  if (!Art) return null;
  return (
    <View style={styles.art} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 150 200" preserveAspectRatio="xMidYMid meet">
        <Art />
      </Svg>
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Bottom / edge accents (pixel units, clipped by the card)             */
/* ------------------------------------------------------------------ */

function wavePath(width: number, w: number, top: number, depth: number, h: number) {
  let d = `M0 ${top}`;
  for (let x = 0; x < width; x += w) d += ` q${w / 4} ${-depth} ${w / 2} 0 q${w / 4} ${depth} ${w / 2} 0`;
  return `${d} L${width} ${h} L0 ${h} Z`;
}
const WAVE = wavePath(640, 44, 10, 7, 18);
const ZIGZAG = "0,14 12,4 24,14 36,4 48,14 60,4 72,14 84,4 96,14";

export const GameCardAccent = memo(function GameCardAccent({ id }: { id: GameType }) {
  switch (id) {
    case "talentShow":
      return (
        <>
          <View style={[styles.lineTop, { height: 2, backgroundColor: "#F5C842" }]} pointerEvents="none" />
          <View style={[styles.lineBottom, { height: 2, backgroundColor: "#F5C842" }]} pointerEvents="none" />
          <View style={styles.bottomSvg} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Dashes
                width={2.5}
                list={[
                  [16, 8, 20, 4, "#F27BA8"],
                  [150, 6, 156, 6, "#F5C842"],
                  [210, 10, 214, 4, "#F27BA8"],
                ]}
              />
            </Svg>
          </View>
        </>
      );
    case "numberGuessor":
      return (
        <>
          <View style={styles.corner} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Path d="M2 26 V2 H60" stroke="#7FE0D6" strokeOpacity={0.7} strokeWidth={2} fill="none" strokeLinecap="round" />
            </Svg>
          </View>
          <View style={[styles.lineBottom, { height: 4, backgroundColor: "#7FE0D6" }]} pointerEvents="none" />
        </>
      );
    case "pieCharts":
      return (
        <View style={styles.bottomSvg} pointerEvents="none">
          <Svg width="100%" height="100%">
            <Path d={WAVE} fill="#B08560" />
          </Svg>
        </View>
      );
    case "potLuck":
      return <View style={[styles.lineBottom, { height: 2, backgroundColor: withAlpha("#A8D5A2", 0.4) }]} pointerEvents="none" />;
    case "blindRanking":
      return <View style={[styles.lineBottom, { height: 4, backgroundColor: "#C9B8FF" }]} pointerEvents="none" />;
    case "tenSecondTasks":
      return (
        <>
          <View style={styles.bottomSvg} pointerEvents="none">
            <Svg width="100%" height="100%">
              <Polyline points={ZIGZAG} stroke="#D9534F" strokeWidth={3} strokeLinejoin="round" fill="none" />
            </Svg>
          </View>
          <View style={[styles.lineBottom, { height: 3, backgroundColor: "#D9534F" }]} pointerEvents="none" />
        </>
      );
    case "auctionDraft":
      return <View style={[styles.lineBottom, { height: 2, backgroundColor: withAlpha("#C8E89A", 0.45) }]} pointerEvents="none" />;
    default:
      return null;
  }
});

const styles = StyleSheet.create({
  art: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "44%",
  },
  lineTop: { position: "absolute", top: 0, left: 0, right: 0 },
  lineBottom: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bottomSvg: { position: "absolute", bottom: 0, left: 0, right: 0, height: 18 },
  corner: { position: "absolute", top: 10, left: 10, width: 64, height: 30 },
});
