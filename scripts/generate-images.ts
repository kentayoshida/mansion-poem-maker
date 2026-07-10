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

// 各軸の画像プロンプト（建築・情景ムード。文字・ロゴ・人物は入れない）
const AXIS_PROMPTS: Record<Axis, string> = {
  toshin:
    "Photorealistic cinematic twilight view of a modern Tokyo high-rise district, glowing office windows and city lights, refined prestigious mood, deep blue and gold tones. No text, no logos, no people. Vertical 3:4 composition.",
  shizen:
    "Photorealistic serene residential street lined with lush green trees and seasonal foliage in Tokyo, soft morning light, calm natural mood, fresh green tones. No text, no logos, no people. Vertical 3:4 composition.",
  teitaku:
    "Photorealistic elegant low-rise luxury residence entrance in an upscale Tokyo neighborhood, tasteful stone, greenery and warm lighting, dignified quiet mood, muted charcoal and gold tones. No text, no logos, no people. Vertical 3:4 composition.",
  bunka:
    "Photorealistic traditional Japanese townscape with a historic shrine gate and old shops at dusk, warm lanterns, cultural nostalgic mood, deep crimson and amber tones. No text, no logos, no people. Vertical 3:4 composition.",
  kurashi:
    "Photorealistic warm friendly local shopping street in Tokyo at golden hour, cozy everyday-life mood, gentle warm tones. No text, no logos, no people. Vertical 3:4 composition.",
  keikan:
    "Photorealistic beautiful cityscape viewed from a hill with a wide horizon and soft sky, scenic airy mood, teal and light-blue tones. No text, no logos, no people. Vertical 3:4 composition.",
  kaiho:
    "Photorealistic bright open Tokyo bay waterfront with canals and wide sky, spacious liberating mood, cool light-blue tones. No text, no logos, no people. Vertical 3:4 composition.",
};

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-image";
const PER_AXIS = Number(process.env.PER_AXIS ?? 8); // 7軸 × 8 = 56枚
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity; // 生成上限（サンプル用）
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

  outer: for (const axis of ATTRIBUTE_AXES) {
    for (let i = 0; i < PER_AXIS; i++) {
      if (made >= LIMIT) break outer;
      const file = `${axis}-${String(i).padStart(2, "0")}.png`;
      try {
        const buf = await callGemini(AXIS_PROMPTS[axis]);
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
