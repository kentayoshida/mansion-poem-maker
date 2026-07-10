/**
 * マンションポエム画像DB 生成スクリプト（オフライン・一度きり実行）
 *
 * 目的:
 *   属性軸ごとの雰囲気画像をAI画像生成APIで50〜100枚生成し、
 *   public/poem-images/ に保存、src/data/images.ts のマニフェストを更新する。
 *   生成結果はリポジトリにコミットする前提で、実行時（Web表示時）はAPI非依存。
 *
 * 前提:
 *   - 環境変数 OPENAI_API_KEY が必要（プロバイダは差し替え可能）。
 *   - リモート実行環境ではネットワークポリシーによりブロックされ得る。
 *     その場合でも、アプリ本体は src/lib/image.ts のSVGフォールバックで動作する。
 *
 * 実行:
 *   OPENAI_API_KEY=xxxx npm run generate:images
 *   （画像枚数は PER_AXIS で調整。7軸 × PER_AXIS 枚を生成）
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ATTRIBUTE_AXES = [
  "toshin",
  "shizen",
  "teitaku",
  "bunka",
  "kurashi",
  "keikan",
  "kaiho",
] as const;
type Axis = (typeof ATTRIBUTE_AXES)[number];

// 各軸の画像プロンプト（建築・情景ムード。文字は入れない）
const AXIS_PROMPTS: Record<Axis, string> = {
  toshin:
    "A cinematic twilight view of a modern Tokyo high-rise district, glowing office windows, refined and prestigious mood, no text, vertical composition, photographic",
  shizen:
    "A serene residential street lined with lush green trees and seasonal foliage in Tokyo, soft morning light, calm natural mood, no text, vertical composition, photographic",
  teitaku:
    "An elegant low-rise luxury residence entrance in an upscale Tokyo neighborhood, tasteful stone and greenery, dignified and quiet mood, no text, vertical composition, photographic",
  bunka:
    "A traditional Japanese townscape with historic shrine gate and old shops at dusk, warm lanterns, cultural and nostalgic mood, no text, vertical composition, photographic",
  kurashi:
    "A warm friendly local shopping street in Tokyo at golden hour, cozy everyday life mood, gentle warm tones, no text, vertical composition, photographic",
  keikan:
    "A beautiful cityscape viewed from a hill with a wide horizon and soft sky, scenic and airy mood, no text, vertical composition, photographic",
  kaiho:
    "A bright open Tokyo bay waterfront with canals and wide sky, spacious and liberating mood, cool light tones, no text, vertical composition, photographic",
};

const PER_AXIS = Number(process.env.PER_AXIS ?? 8); // 7軸 × 8 = 56枚
const OUT_DIR = join(process.cwd(), "public", "poem-images");
const MANIFEST = join(process.cwd(), "src", "data", "images.ts");
const API_KEY = process.env.OPENAI_API_KEY;

async function generateOne(axis: Axis, index: number, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1024x1536",
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { data: { b64_json: string }[] };
  const b64 = data.data[0].b64_json;
  const file = `${axis}-${String(index).padStart(2, "0")}.png`;
  await writeFile(join(OUT_DIR, file), Buffer.from(b64, "base64"));
  return file;
}

async function main() {
  if (!API_KEY) {
    console.error(
      "OPENAI_API_KEY が未設定です。画像生成をスキップします（アプリはSVGフォールバックで動作します）。"
    );
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const manifest: { file: string; axes: Axis[] }[] = [];
  for (const axis of ATTRIBUTE_AXES) {
    for (let i = 0; i < PER_AXIS; i++) {
      try {
        const file = await generateOne(axis, i, AXIS_PROMPTS[axis]);
        manifest.push({ file, axes: [axis] });
        console.log(`generated ${file}`);
      } catch (err) {
        console.error(`failed ${axis} #${i}:`, err);
      }
    }
  }

  const body = `// 自動生成: scripts/generate-images.ts が更新します。手動編集しないでください。
import type { Axis } from "@/lib/attributes";

export interface PoemImage {
  file: string;
  axes: Axis[];
}

export const POEM_IMAGES: readonly PoemImage[] = ${JSON.stringify(
    manifest,
    null,
    2
  )};
`;
  await writeFile(MANIFEST, body);
  console.log(`\nDone. ${manifest.length} images. Manifest written to ${MANIFEST}`);
}

main();
