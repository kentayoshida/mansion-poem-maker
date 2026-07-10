// マンションポエム画像DBのマニフェスト
//
// scripts/generate-images.ts がAI画像を生成し public/poem-images/ に保存したうえで、
// この配列を更新する（ファイル名 ↔ 属性軸タグ）。ここが空でも、
// src/lib/image.ts が属性テーマのSVG背景にフォールバックするためアプリは動作する。

import type { Axis } from "@/lib/attributes";

export interface PoemImage {
  file: string; // /poem-images/ 以下のファイル名
  axes: Axis[]; // この画像が表す属性軸（優先順）
}

// 生成済み画像（初期状態は空。generate:images 実行後に追記される）
export const POEM_IMAGES: readonly PoemImage[] = [];
