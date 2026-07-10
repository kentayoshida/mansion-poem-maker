// 画像の決定的な選択
// - 「マンションポエム画像DB」(POEM_IMAGES) に、駅の支配的属性に合う画像があれば
//   決定的に1枚選ぶ。
// - 無ければ属性テーマのSVG背景を生成してフォールバックする（外部素材ゼロ）。

import { POEM_IMAGES } from "@/data/images";
import {
  type Axis,
  type AttributeVector,
  dominantAxis,
} from "@/lib/attributes";
import { SeededRandom } from "@/lib/hash";

export interface PickedImage {
  kind: "file" | "svg";
  src: string; // 画像URL または data URI
  axis: Axis;
}

// 属性軸ごとの配色テーマ（SVGフォールバック＆カードの下地に使用）
export const AXIS_THEMES: Record<
  Axis,
  { from: string; to: string; accent: string; ink: string }
> = {
  toshin: { from: "#0b1e3f", to: "#1b2b4a", accent: "#c9a24b", ink: "#f5f7fb" },
  shizen: { from: "#123322", to: "#31603d", accent: "#cfe3b0", ink: "#f3f8ef" },
  teitaku: { from: "#191921", to: "#2c2c38", accent: "#c9a24b", ink: "#f6f2e8" },
  bunka: { from: "#3a1720", to: "#5c2733", accent: "#d9a441", ink: "#f7ede1" },
  kurashi: { from: "#472c18", to: "#7a5230", accent: "#f0c987", ink: "#fdf5ea" },
  keikan: { from: "#14384a", to: "#2f6d84", accent: "#bfe3ef", ink: "#f1fbff" },
  kaiho: { from: "#22506e", to: "#5a97b8", accent: "#eaf6ff", ink: "#f7fdff" },
};

// 支配的属性に合う画像候補を返す
function candidatesFor(axis: Axis) {
  const matches = POEM_IMAGES.filter((img) => img.axes.includes(axis));
  return matches.length > 0 ? matches : POEM_IMAGES;
}

export function pickImage(attrs: AttributeVector, rng: SeededRandom): PickedImage {
  const axis = dominantAxis(attrs);
  const pool = candidatesFor(axis);
  if (pool.length > 0) {
    const chosen = rng.pick(pool);
    return { kind: "file", src: `/poem-images/${chosen.file}`, axis };
  }
  return { kind: "svg", src: svgBackground(axis, rng), axis };
}

// 属性テーマのSVG背景を data URI で生成（決定的）
export function svgBackground(axis: Axis, rng: SeededRandom): string {
  const t = AXIS_THEMES[axis];
  const W = 800;
  const H = 1000;

  // 下部シルエット（属性で表情を変える）
  const silhouette = buildSilhouette(axis, rng, W, H, t.accent);
  // 上部の光（放射グラデ）
  const glowX = Math.round(120 + rng.next() * 560);
  const glowY = Math.round(120 + rng.next() * 160);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.from}"/>
      <stop offset="1" stop-color="${t.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="${glowY}" r="380" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${t.accent}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${silhouette}
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildSilhouette(
  axis: Axis,
  rng: SeededRandom,
  W: number,
  H: number,
  accent: string
): string {
  const fill = "#000000";
  const op = 0.28;

  if (axis === "toshin" || axis === "teitaku") {
    // 都市のスカイライン
    let x = -20;
    const rects: string[] = [];
    while (x < W + 20) {
      const w = 40 + rng.nextInt(70);
      const h = 120 + rng.nextInt(320);
      rects.push(
        `<rect x="${x}" y="${H - h}" width="${w}" height="${h}" fill="${fill}" opacity="${op}"/>`
      );
      x += w + 6 + rng.nextInt(14);
    }
    return rects.join("\n");
  }

  if (axis === "kaiho" || axis === "keikan") {
    // 水面・遠景の波
    const bands: string[] = [];
    for (let i = 0; i < 4; i++) {
      const y = H - 60 - i * 55 - rng.nextInt(20);
      const amp = 14 + rng.nextInt(16);
      bands.push(
        `<path d="M0 ${y} Q ${W / 4} ${y - amp} ${W / 2} ${y} T ${W} ${y} V ${H} H 0 Z" fill="${accent}" opacity="${0.06 + i * 0.03}"/>`
      );
    }
    return bands.join("\n");
  }

  if (axis === "bunka") {
    // 昇る円（日輪）＋地平
    const cx = 200 + rng.nextInt(400);
    const cy = 300 + rng.nextInt(120);
    const r = 90 + rng.nextInt(60);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${accent}" opacity="0.18"/>
    <rect x="0" y="${H - 160}" width="${W}" height="160" fill="${fill}" opacity="${op}"/>`;
  }

  // shizen / kurashi: なだらかな丘
  const hills: string[] = [];
  for (let i = 0; i < 3; i++) {
    const y = H - 90 - i * 70 - rng.nextInt(30);
    const cxp = rng.nextInt(W);
    hills.push(
      `<path d="M0 ${H} L0 ${y} Q ${cxp} ${y - 90} ${W} ${y} L ${W} ${H} Z" fill="${fill}" opacity="${op - i * 0.06}"/>`
    );
  }
  return hills.join("\n");
}
