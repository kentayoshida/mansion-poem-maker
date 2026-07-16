/**
 * マンションポエム画像DB 生成スクリプト（オフライン・一度きり実行）
 *
 * 目的:
 *   属性軸ごとの雰囲気画像を Gemini API で生成し、public/poem-images/ に保存、
 *   src/data/images.ts のマニフェストを更新する。
 *   生成結果はリポジトリにコミットする前提で、実行時（Web表示時）はAPI非依存。
 *
 * 前提:
 *   - 環境変数 GEMINI_API_KEY が必要（コードにハードコードしない）。
 *   - リモート実行環境ではネットワークポリシーにより
 *     generativelanguage.googleapis.com がブロックされ得る。
 *     その場合でも、アプリ本体は src/lib/image.ts のSVGフォールバックで動作する。
 *
 * 実行:
 *   GEMINI_API_KEY=xxxx npm run generate:images                 # 全軸を PER_AXIS 枚ずつ
 *   GEMINI_API_KEY=xxxx LIMIT=3 npm run generate:images          # 先頭から3枚だけ（サンプル）
 *   GEMINI_API_KEY=xxxx PER_AXIS=10 npm run generate:images      # 1軸あたりの枚数を変更
 *
 * 注意:
 *   マニフェスト(images.ts)は「既存の生成物＋今回の生成物」をマージして書き出す。
 *   サンプル実行で一部だけ作っても既存分は失われない。
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

// 属性軸（src/lib/attributes.ts と一致）。ポエム側では全軸を使うが、
// 画像は teitaku（邸宅）を単独パターンとして持たず、下の IMAGE_AXES のみ生成する。
type Axis =
  | "toshin"
  | "shizen"
  | "teitaku"
  | "bunka"
  | "kurashi"
  | "keikan"
  | "kaiho";

// 画像を生成する軸（teitaku は除外。邸宅系の駅は都心画像で代替＝image.ts のフォールバック）
const IMAGE_AXES = [
  "toshin",
  "shizen",
  "bunka",
  "kurashi",
  "keikan",
  "kaiho",
] as const;
type ImageAxis = (typeof IMAGE_AXES)[number];

// 各軸の画像プロンプト
// マンションポエムの典型ビジュアル: 都市を上空から鳥瞰し、マンション建設予定地から
// 地上へ向けて一本の光の柱（ライトビーム）を立ち上げる構図。特定の建物には寄らず、
// 街並み全体を広く見せる。軸ごとに時間帯・情景・色味を変える。
// 文字・ロゴ・人物は入れない。上部に空の余白を残す（縦書きポエム用）。
const BEAM_BASE =
  "Photorealistic high-altitude aerial bird's-eye drone view looking down over a wide Tokyo " +
  "townscape, showing the whole cityscape sprawl (not a single building close-up). " +
  "One RECTANGULAR building plot on the ground is highlighted and glowing, and a tall vertical " +
  "column of light shaped like a RECTANGULAR PRISM (clear rectangular cross-section, like a " +
  "luminous translucent box) rises straight up from that rectangular footprint, making the " +
  "future building site stand out. The light is a rectangular volume — NOT a thin line and NOT " +
  "a circular pool; the glowing footprint on the ground is a clean rectangle. " +
  "Wide open sky at the top for negative space. Cinematic real-estate hero visual. " +
  "No text, no logos, no people. Vertical 3:4 composition.";

// 各軸あたり複数カットの Scene 文（時間帯・天候・カメラ・季節を変えて多様化）。
// i 番目の画像には AXIS_SCENES[axis][i % 長さ] を使う。ライトプリズムは全カット維持。
const AXIS_SCENES: Record<ImageAxis, string[]> = {
  toshin: [
    "a vast Tokyo night skyline, a sea of glittering lights to the horizon, deep blue and gold, top-down aerial; rectangular prism glows radiant golden-amber; prestigious mood.",
    "a metropolis at magic-hour twilight, purple-orange sky, oblique 45-degree bird's-eye; rectangular prism glows radiant gold; prestigious mood.",
    "a dense high-rise core in blue hour, cool blue with warm window lights, wide distant view; rectangular prism glows amber-gold; prestigious mood.",
    "a rain-wet Tokyo night, neon reflections on avenues, cinematic faint mist; rectangular prism glows amber; prestigious mood.",
    "a clear midday metropolis, crisp shadows, silver-blue tones, very high top-down; rectangular prism glows pale gold; prestigious mood.",
    "the city before dawn, low fog drifting between towers, first warm light, elevated drone angle; rectangular prism glows soft gold; prestigious mood.",
    "a crisp winter night, distant illumination bokeh, deep navy sky; rectangular prism glows radiant gold; prestigious mood.",
    "a dusk panorama, layered tower silhouettes to the horizon, gold-amber sky; rectangular prism glows warm gold; prestigious mood.",
  ],
  shizen: [
    "a leafy green residential district at midday, tree-lined avenues and parks, top-down; rectangular prism glows soft pale-green white; calm natural mood.",
    "a fresh-green early-summer town, sunlight through zelkova canopies, oblique 45-degree view; rectangular prism glows white-green; calm mood.",
    "a cherry-blossom spring district, pink-tinged treetops over low houses, airy pastel tones; rectangular prism glows gentle pale green; calm mood.",
    "a morning-mist neighborhood, dew and low fog over gardens; rectangular prism glows cool green-white; calm mood.",
    "autumn foliage streets, warm amber-green leaves, golden-hour side light; rectangular prism glows soft green; calm mood.",
    "a riverside greenway with rows of trees and reflective water at midday; rectangular prism glows light-green; calm mood.",
    "a quiet garden district after rain, wet fresh leaves, overcast soft light; rectangular prism glows pale green; calm mood.",
    "a wide green hilly suburb at dusk, layered treetops to the horizon; rectangular prism glows mild green-gold; calm mood.",
  ],
  bunka: [
    "a historic townscape with temple roofs and old streets at evening, top-down; rectangular prism glows warm amber; crimson-amber tones; nostalgic mood.",
    "a lantern-lit old quarter at dusk, warm paper-lantern glow across alleys, oblique 45-degree view; rectangular prism glows amber; nostalgic mood.",
    "a shrine precinct among trees at twilight, torii and rooftops, deep vermilion and amber; rectangular prism glows soft amber; nostalgic mood.",
    "a snow-dusted old townscape, tiled roofs under grey sky, muted warm tones; rectangular prism glows warm amber; quiet nostalgic mood.",
    "a festival evening, rows of red lanterns and stalls seen from above, warm golden glow; rectangular prism glows amber; nostalgic mood.",
    "narrow traditional streets at blue hour, tiled roofs and lit windows; rectangular prism glows warm amber; nostalgic mood.",
    "an autumn temple district, maple reds over old roofs, low warm sun; rectangular prism glows amber; nostalgic mood.",
    "a riverside old town at magic hour, wooden houses and bridges, amber-crimson glow; rectangular prism glows warm amber; nostalgic mood.",
  ],
  kurashi: [
    "a friendly low-rise neighborhood with a shopping street at golden hour, top-down; rectangular prism glows cozy warm white; everyday-life mood.",
    "a lively local shotengai from above at dusk, awnings and lit shopfronts; rectangular prism glows warm white; everyday-life mood.",
    "quiet residential blocks at early evening, glowing house windows, oblique 45-degree view; rectangular prism glows cozy amber; everyday-life mood.",
    "a weekend town under a clear midday sky, parks and small streets; rectangular prism glows bright warm-white; everyday-life mood.",
    "a rainy-day neighborhood, wet streets and gentle reflections, soft grey light; rectangular prism glows warm white; everyday-life mood.",
    "a morning town with light haze, low sun down the streets; rectangular prism glows fresh warm white; everyday-life mood.",
    "autumn suburban streets, roadside trees turning, golden-hour warmth; rectangular prism glows cozy amber; everyday-life mood.",
    "a snowy quiet residential area at dusk, warm lit windows; rectangular prism glows soft amber-white; everyday-life mood.",
  ],
  keikan: [
    "a cityscape with a wide horizon and distant hills at midday, top-down; rectangular prism glows cool light-blue white; teal tones; scenic airy mood.",
    "a skyline against a distant Mt. Fuji silhouette at dusk, layered ridgelines, oblique 45-degree view; rectangular prism glows cool blue; scenic mood.",
    "a hilltop view over rooftops to a bright horizon on a clear day; rectangular prism glows teal-blue; scenic mood.",
    "a blue-hour panorama, the city fading into distant haze; rectangular prism glows cool luminous blue; scenic mood.",
    "a clear crisp afternoon, a sharp distant skyline, silver-teal tones; rectangular prism glows light-blue; scenic mood.",
    "a sea-of-clouds dawn over a low city, pastel sky; rectangular prism glows cool light-blue; scenic mood.",
    "a sunset over a broad townscape, gradient orange-to-teal sky; rectangular prism glows cool blue accent; scenic mood.",
    "a winter clear-air panorama, distant snow-capped ridges; rectangular prism glows bright blue-white; scenic mood.",
  ],
  kaiho: [
    "a bright bay waterfront with canals and towers under a wide sky at midday, top-down; rectangular prism glows bright white-blue; spacious liberating mood.",
    "an open harbor district at dusk, water reflecting the sky, spacious oblique 45-degree view; rectangular prism glows cool white-blue; spacious mood.",
    "a wide riverside with bridges under a vast clear sky, airy light-blue tones; rectangular prism glows bright white-blue; spacious mood.",
    "a blue-hour waterfront, calm water and distant lights; rectangular prism glows luminous white-blue; spacious mood.",
    "a sunny promenade and marina from above, sparkling water; rectangular prism glows cool white-blue; spacious mood.",
    "a dawn over the bay, soft pastel sky and still water; rectangular prism glows gentle white-blue; spacious mood.",
    "a breezy summer waterfront, scattered clouds over a deep-blue sea; rectangular prism glows bright white-blue; spacious mood.",
    "a sunset bay panorama, wide horizon, warm-to-cool sky gradient; rectangular prism glows cool white-blue accent; spacious mood.",
  ],
};

function promptFor(axis: ImageAxis, i: number): string {
  const scenes = AXIS_SCENES[axis];
  return `${BEAM_BASE} Scene: ${scenes[i % scenes.length]}`;
}

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image";
const PER_AXIS = Number(process.env.PER_AXIS ?? 8); // 6軸 × 8 = 48枚
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity; // 生成上限（サンプル用）
// AXES=toshin,shizen のように生成対象軸を絞れる（未指定なら全 IMAGE_AXES）
const AXES_FILTER = process.env.AXES
  ? new Set(process.env.AXES.split(",").map((s) => s.trim()))
  : null;
const OUT_DIR = join(process.cwd(), "public", "poem-images");
const MANIFEST = join(process.cwd(), "src", "data", "images.ts");
const API_KEY = process.env.GEMINI_API_KEY;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  inline_data?: { mime_type: string; data: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message?: string };
}

// 認証方式を2通り試す（標準APIキー: x-goog-api-key / OAuthトークン: Bearer）
function authVariants(key: string): { label: string; headers: Record<string, string> }[] {
  return [
    { label: "x-goog-api-key", headers: { "x-goog-api-key": key } },
    { label: "Bearer", headers: { Authorization: `Bearer ${key}` } },
  ];
}

let chosenAuth: { label: string; headers: Record<string, string> } | null = null;

async function callGemini(prompt: string): Promise<Buffer> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "3:4" },
    },
  });

  // 認証方式は初回に確定したものを使い回す
  const variants = chosenAuth ? [chosenAuth] : authVariants(API_KEY!);
  let lastErr = "";
  for (const variant of variants) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...variant.headers },
      body,
    });
    if (res.status === 401 || res.status === 403) {
      lastErr = `${variant.label}: ${res.status} ${await res.text()}`;
      continue; // 別の認証方式へ
    }
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }
    if (!chosenAuth) {
      chosenAuth = variant;
      console.log(`  認証方式: ${variant.label}`);
    }
    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const data = p.inlineData?.data ?? p.inline_data?.data;
      if (data) return Buffer.from(data, "base64");
    }
    throw new Error(
      `画像データがレスポンスに含まれていません: ${JSON.stringify(json).slice(0, 400)}`
    );
  }
  throw new Error(`認証に失敗しました（x-goog-api-key / Bearer いずれも不可）。${lastErr}`);
}

async function loadExistingManifest(): Promise<{ file: string; axes: Axis[] }[]> {
  try {
    const src = await readFile(MANIFEST, "utf8");
    const m = src.match(/POEM_IMAGES[^=]*=\s*(\[[\s\S]*?\]);/);
    if (!m) return [];
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

async function writeManifest(entries: { file: string; axes: Axis[] }[]) {
  // file をキーに重複排除（後勝ち）
  const byFile = new Map(entries.map((e) => [e.file, e]));
  const merged = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
  const body = `// 自動生成: scripts/generate-images.ts が更新します。手動編集しないでください。
import type { Axis } from "@/lib/attributes";

export interface PoemImage {
  file: string;
  axes: Axis[];
}

export const POEM_IMAGES: readonly PoemImage[] = ${JSON.stringify(merged, null, 2)};
`;
  await writeFile(MANIFEST, body);
}

async function main() {
  if (!API_KEY) {
    console.error(
      "GEMINI_API_KEY が未設定です。画像生成をスキップします（アプリはSVGフォールバックで動作します）。"
    );
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const manifest = await loadExistingManifest();
  let made = 0;

  outer: for (const axis of IMAGE_AXES) {
    if (AXES_FILTER && !AXES_FILTER.has(axis)) continue;
    for (let i = 0; i < PER_AXIS; i++) {
      if (made >= LIMIT) break outer;
      const file = `${axis}-${String(i).padStart(2, "0")}.png`;
      try {
        const buf = await callGemini(promptFor(axis, i));
        await writeFile(join(OUT_DIR, file), buf);
        manifest.push({ file, axes: [axis] });
        made++;
        console.log(`generated ${file} (${buf.length} bytes)`);
      } catch (err) {
        console.error(`failed ${file}:`, err instanceof Error ? err.message : err);
        // 認証エラーで最初から失敗した場合は打ち切る
        if (made === 0 && String(err).includes("認証に失敗")) process.exit(2);
      }
    }
  }

  await writeManifest(manifest);
  console.log(
    `\nDone. 今回 ${made} 枚生成。マニフェスト合計 ${manifest.length} 枚 → ${MANIFEST}`
  );
}

main();
