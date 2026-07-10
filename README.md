# マンションポエムメーカー

駅名を入れると、その街の空気をまとった架空の「マンションポエム」を、
雰囲気画像とともに生成するWebアプリのMVP。
`your-own-devil-fruit-maker` の「入力→決定的ハッシュ→DB照合/生成→カード表示→画像共有」
というジャーニーとコード構造をベースにしている。

対象は東京23区の主要駅。将来的に駅の追加・他県への拡大を想定した構造。

## 仕組み

```
駅名入力 → 正規化・別名解決（stationLookup）
        → 駅プロファイル（エリア属性ベクトル / stations.ts）
        → hash(駅名) でシード → SeededRandom（hash.ts）
        → テンプレート＋属性重み語彙でポエム組み立て（poem.ts / vocabulary.ts）
        → 属性に合う画像を決定的に選択（image.ts / images.ts）
        → カード表示 → PNGで共有（share.ts）
```

- **同じ駅名なら常に同じ一編**（決定的生成。表記ゆれ〈かな/漢字/ローマ字/「駅」有無〉も吸収）。
- エリア↔ポエムの相関は、マンションポエムの共起ネットワーク（上位100語）を
  7つの属性軸に再構成し、各駅を重み付けして表現している（`docs/poem-research.md`）。
- 出力（物件名・コピー・画像）はすべて**架空（パロディ）**。実在の物件・企業・広告とは無関係。

## 主要ファイル

| ファイル | 役割 |
| --- | --- |
| `src/lib/hash.ts` | 決定的ハッシュ / 乱数（ベースから流用） |
| `src/lib/attributes.ts` | エリア属性軸（7軸）の定義 |
| `src/data/stations.ts` | 駅DB（23区主要駅・属性ベクトル） |
| `src/data/vocabulary.ts` | 語彙DB（既存マンションポエムDBの実体） |
| `src/lib/stationLookup.ts` | 駅名正規化・プロファイル解決・フォールバック |
| `src/lib/poem.ts` | 架空ポエム生成ロジック |
| `src/lib/image.ts` / `src/data/images.ts` | 画像の決定的選択・SVGフォールバック・マニフェスト |
| `scripts/generate-images.ts` | 画像DB生成（オフライン・AI画像生成） |

## 開発

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

### 画像DB（AI生成）の作成（任意・オフライン）

```bash
OPENAI_API_KEY=xxxx npm run generate:images
```

`public/poem-images/` に画像を生成し `src/data/images.ts` を更新する（成果物はコミット前提）。
未生成でも、属性テーマのSVG背景に自動フォールバックするためアプリは動作する。

## 免責

本サービスが生成する物件名・キャッチコピー・画像はすべて架空（パロディ）であり、
実在の物件・企業・広告とは一切関係ありません。エリアの傾向は一般的なイメージに基づく
戯画化であり、正確性を保証するものではありません。
