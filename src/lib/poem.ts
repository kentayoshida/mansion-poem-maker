// 架空マンションポエム生成ロジック（your-own-devil-fruit-maker の matcher.ts 相当）
//
// 駅プロファイル（エリア属性ベクトル）→ 決定的シード → テンプレート＋属性重み語彙で
// ポエムを組み立てる。同じ入力（＝同じ駅に解決される表記ゆれを含む）に対しては
// 常に同じ結果を返す（「同じ郵便番号＝駅に同じポエム」要件）。

import { hashString, SeededRandom } from "@/lib/hash";
import {
  resolveStation,
  type StationProfile,
  type MatchType,
} from "@/lib/stationLookup";
import {
  type Axis,
  type AttributeVector,
  toWeightedAxes,
  dominantAxis,
  normalizeVector,
  ATTRIBUTE_AXES,
} from "@/lib/attributes";
import {
  AXIS_POOLS,
  VERBS,
  CLOSINGS,
  BRAND_PREFIXES,
  BRAND_SUFFIXES,
} from "@/data/vocabulary";
import { pickImage, type PickedImage } from "@/lib/image";

export interface PoemResult {
  input: string; // 入力そのまま
  place: string; // 表示地名（駅名 or 区名）
  ward: string; // 区
  lines: readonly string[]; // 代表路線
  matchType: MatchType; // 駅一致 / 区フォールバック / 汎用
  poem: string[]; // ポエム本文（1〜3行）
  propertyName: string; // 物件名（架空）
  walkMinutes: number; // 「徒歩◯分」
  promo: string; // 販促フレーズ（3行目）
  themeAxis: Axis; // 支配的な属性軸
  themeAxes: Axis[]; // 上位2軸（デバッグ・表示用）
  image: PickedImage; // 背景画像
}

// 目的語（を〜）を取れる他動詞のサブセット
const TRANSITIVE_VERBS = [
  "纏う",
  "刻む",
  "継ぐ",
  "描く",
  "愉しむ",
  "味わう",
  "極める",
  "紡ぐ",
  "結ぶ",
  "掌中に収める",
  "享受する",
  "育む",
  "誘う",
] as const;

// 販促フレーズ（カード3行目）。駅ごとに決定的に1つ選ぶ。
const PROMO_LINES = [
  "モデルルーム オープン",
  "豊富な間取り 1K〜4LDK",
  "先着予約 申込受付中",
] as const;

// 属性重みで軸を1つ選ぶ（全て0なら kurashi にフォールバック）
function chooseAxis(rng: SeededRandom, attrs: AttributeVector): Axis {
  const weighted = toWeightedAxes(attrs);
  if (weighted.length === 0) return "kurashi";
  return rng.weightedPick(weighted);
}

function scene(rng: SeededRandom, attrs: AttributeVector): string {
  return rng.pick(AXIS_POOLS[chooseAxis(rng, attrs)].scenes);
}
function modifier(rng: SeededRandom, attrs: AttributeVector): string {
  return rng.pick(AXIS_POOLS[chooseAxis(rng, attrs)].modifiers);
}
function value(rng: SeededRandom, attrs: AttributeVector): string {
  return rng.pick(AXIS_POOLS[chooseAxis(rng, attrs)].values);
}
function verb(rng: SeededRandom): string {
  return rng.pick(TRANSITIVE_VERBS);
}
function closing(rng: SeededRandom): string {
  return rng.pick(CLOSINGS);
}

// ポエム本文のテンプレート群。各テンプレは string[]（1〜3行）を返す。
type Template = (
  rng: SeededRandom,
  attrs: AttributeVector,
  profile: StationProfile
) => string[];

const TEMPLATES: Template[] = [
  // 1) 情景 → 価値を動詞で締める
  (r, a) => [`${modifier(r, a)}${scene(r, a)}に、${value(r, a)}を${verb(r)}。`],
  // 2) 情景を動詞、地名で締める
  (r, a, p) => [`${scene(r, a)}を${verb(r)}、${p.name}。`],
  // 3) 2行構成：価値の宣言 → 誕生
  (r, a) => [
    `${value(r, a)}を、${verb(r)}。`,
    `${modifier(r, a)}${scene(r, a)}に、${closing(r)}が誕生する。`,
  ],
  // 4) 地名、価値の締め
  (r, a, p) => [`${p.name}、${value(r, a)}の${closing(r)}。`],
  // 5) ランドマーク差し込み
  (r, a, p) => [
    `${landmark(r, p)}を、${verb(r)}。`,
    `${modifier(r, a)}日々を、この地に。`,
  ],
  // 6) 情景の体言止め → 価値を動詞
  (r, a) => [
    `${modifier(r, a)}${scene(r, a)}。`,
    `${value(r, a)}に${verb(r)}、${closing(r)}へ。`,
  ],
  // 7) 地名で始め、2つの価値が交わる
  (r, a, p) => [
    `ここは${p.name}。`,
    `${value(r, a)}と${value(r, a)}が交わる、${closing(r)}。`,
  ],
  // 8) 「住まうという選択」型
  (r, a) => [
    `${scene(r, a)}に住まう、という選択。`,
    `${modifier(r, a)}${value(r, a)}を、掌中に。`,
  ],
];

function landmark(rng: SeededRandom, profile: StationProfile): string {
  if (profile.landmarks.length > 0) return rng.pick(profile.landmarks);
  return "この街";
}

// 物件名（架空）を組み立てる。実在ブランド名は使わない。
function buildPropertyName(rng: SeededRandom, profile: StationProfile): string {
  const suffix = rng.pick(BRAND_SUFFIXES);
  if (profile.romaji && rng.next() < 0.55) {
    return `THE ${profile.romaji.toUpperCase()} ${suffix}`;
  }
  const jaPrefixes = BRAND_PREFIXES.filter((p) => p !== "THE");
  const prefix = rng.pick(jaPrefixes);
  return `${prefix}${profile.name} ${suffix}`;
}

// 上位N軸を返す
function topAxes(attrs: AttributeVector, n: number): Axis[] {
  const norm = normalizeVector(attrs);
  return [...ATTRIBUTE_AXES]
    .sort((x, y) => norm[y] - norm[x])
    .filter((ax) => norm[ax] > 0)
    .slice(0, n);
}

export function generatePoem(input: string, reroll: number = 0): PoemResult | null {
  const profile = resolveStation(input);
  if (!profile) return null;

  // 表記ゆれを吸収するため、解決後の地名+区でシードを作る
  const seed = hashString(`${profile.name}|${profile.ward}`, reroll);
  const rng = new SeededRandom(seed);

  const attrs = profile.attrs;

  // 本文
  const template = rng.pick(TEMPLATES);
  const poem = template(rng, attrs, profile);

  // 物件名・徒歩分数
  const propertyName = buildPropertyName(rng, profile);
  const walkMinutes = 1 + rng.nextInt(9);

  // 画像（同一シードで決定的に選択）
  const image = pickImage(attrs, rng);

  // 販促フレーズ（3行目）
  const promo = rng.pick(PROMO_LINES);

  return {
    input,
    place: profile.name,
    ward: profile.ward,
    lines: profile.lines,
    matchType: profile.matchType,
    poem,
    propertyName,
    walkMinutes,
    promo,
    themeAxis: dominantAxis(attrs),
    themeAxes: topAxes(attrs, 2),
    image,
  };
}
