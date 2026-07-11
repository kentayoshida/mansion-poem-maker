// エリア属性軸の定義
// 添付の「マンションポエム共起ネットワーク（上位100語）」のクラスタを、
// 7つの属性軸に再構成したもの。各駅・各語彙・各画像はこの軸で重み付けされ、
// 駅（エリア）↔ ポエムの相関ロジックの土台になる。

export const ATTRIBUTE_AXES = [
  "toshin", // 都心・利便（都心/駅/アクセス/利便/東京/徒歩/駅前/施設/生活）
  "shizen", // 自然・環境（緑/自然/四季/公園/潤い/彩る/空/環境）
  "teitaku", // 邸宅・格式（邸宅/レジデンス/誕生/地/新た/中心）
  "bunka", // 文化・歴史（文化/歴史/日本橋/日本/伝統）
  "kurashi", // 暮らし・街（街/暮らし/暮らす/日々/家族/新しい）
  "keikan", // 景観・美（美しい/街並み/景観/風景）
  "kaiho", // 開放・空間（開放/広がる/空間/時間/デザイン/穏やか/育む/魅力）
] as const;

export type Axis = (typeof ATTRIBUTE_AXES)[number];

// 各属性軸の日本語ラベル（UI表示・デバッグ用）
export const AXIS_LABELS: Record<Axis, string> = {
  toshin: "都心・利便",
  shizen: "自然・環境",
  teitaku: "邸宅・格式",
  bunka: "文化・歴史",
  kurashi: "暮らし・街",
  keikan: "景観・美",
  kaiho: "開放・空間",
};

// 属性重みベクトル。各軸 0〜10 程度の重みを持つ（未指定は 0 扱い）。
export type AttributeVector = Partial<Record<Axis, number>>;

// ベクトルを完全な Record に正規化する
export function normalizeVector(v: AttributeVector): Record<Axis, number> {
  const out = {} as Record<Axis, number>;
  for (const axis of ATTRIBUTE_AXES) {
    out[axis] = v[axis] ?? 0;
  }
  return out;
}

// 支配的な属性軸（重み最大の軸）を返す
export function dominantAxis(v: AttributeVector): Axis {
  const norm = normalizeVector(v);
  let best: Axis = ATTRIBUTE_AXES[0];
  let bestW = -Infinity;
  for (const axis of ATTRIBUTE_AXES) {
    if (norm[axis] > bestW) {
      bestW = norm[axis];
      best = axis;
    }
  }
  return best;
}

// weightedPick 用に {value: Axis, weight} 配列へ変換する
export function toWeightedAxes(
  v: AttributeVector
): { value: Axis; weight: number }[] {
  const norm = normalizeVector(v);
  return ATTRIBUTE_AXES.map((axis) => ({ value: axis, weight: norm[axis] }))
    // 重み 0 の軸は候補から除外（全て 0 の場合のフォールバックは呼び出し側で担保）
    .filter((it) => it.weight > 0);
}
