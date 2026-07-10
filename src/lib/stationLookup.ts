// 駅名の正規化と駅プロファイルの解決
// - 表記ゆれ（全角/半角・かな/漢字/ローマ字・「駅」有無・空白）を吸収
// - 未収録駅は「区」プロファイル → 汎用都市プロファイルの順にフォールバック

import { STATIONS, type Station } from "@/data/stations";
import type { AttributeVector } from "@/lib/attributes";

export type MatchType = "station" | "ward" | "generic";

export interface StationProfile {
  name: string; // ポエムに使う地名
  ward: string; // 区（不明時は空）
  romaji?: string; // 物件名生成用（駅一致時のみ）
  lines: readonly string[];
  landmarks: readonly string[];
  attrs: AttributeVector;
  matchType: MatchType;
}

// 入力の正規化: NFKC → トリム → 小文字 → 「駅」除去 → 空白/中黒/長音除去
function normalize(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/駅$/u, "")
    .replace(/[\s・･ー-]/gu, "");
}

// 区名の候補（「港区」「港」どちらでもヒットさせる）
function wardKeys(ward: string): string[] {
  const base = ward.replace(/区$/u, "");
  return [normalize(ward), normalize(base)];
}

// 区レベルのフォールバックプロファイル（未収録駅でもエリア感を出す）
const WARD_PROFILES: Record<string, { landmarks: string[]; attrs: AttributeVector }> = {
  千代田区: { landmarks: ["皇居", "オフィス街", "都心"], attrs: { toshin: 9, teitaku: 6, bunka: 6 } },
  中央区: { landmarks: ["日本橋", "隅田川", "老舗"], attrs: { toshin: 8, bunka: 7, teitaku: 6 } },
  港区: { landmarks: ["都心", "邸宅街", "洗練の街"], attrs: { teitaku: 9, toshin: 8, keikan: 5 } },
  新宿区: { landmarks: ["副都心", "新宿御苑", "坂の街"], attrs: { toshin: 8, bunka: 5, kurashi: 5 } },
  文京区: { landmarks: ["文教の地", "学びの街", "台地"], attrs: { bunka: 9, teitaku: 6, kurashi: 6 } },
  台東区: { landmarks: ["下町", "寺社", "隅田川"], attrs: { bunka: 9, kurashi: 6 } },
  墨田区: { landmarks: ["スカイツリー", "隅田川", "下町"], attrs: { bunka: 6, kurashi: 6, keikan: 5, kaiho: 4 } },
  江東区: { landmarks: ["運河", "ベイエリア", "水辺"], attrs: { kaiho: 8, keikan: 6, kurashi: 6 } },
  品川区: { landmarks: ["目黒川", "高台", "再開発"], attrs: { toshin: 7, kurashi: 6, keikan: 4 } },
  目黒区: { landmarks: ["目黒川", "並木道", "洗練の街"], attrs: { keikan: 7, kurashi: 7, teitaku: 5 } },
  大田区: { landmarks: ["多摩川", "邸宅街", "商店街"], attrs: { kurashi: 7, teitaku: 5, shizen: 4 } },
  世田谷区: { landmarks: ["みどりの住宅街", "並木", "多摩川"], attrs: { kurashi: 8, shizen: 6, teitaku: 5 } },
  渋谷区: { landmarks: ["都心", "けやき並木", "洗練の街"], attrs: { toshin: 8, teitaku: 6, keikan: 5 } },
  中野区: { landmarks: ["商店街", "サブカルの街", "住宅街"], attrs: { kurashi: 8, toshin: 5, bunka: 5 } },
  杉並区: { landmarks: ["並木道", "落ち着いた住宅街", "公園"], attrs: { kurashi: 8, shizen: 6, bunka: 5 } },
  豊島区: { landmarks: ["副都心", "商店街", "住宅街"], attrs: { toshin: 6, kurashi: 7, bunka: 5 } },
  北区: { landmarks: ["荒川", "飛鳥山", "商店街"], attrs: { kurashi: 8, shizen: 5 } },
  荒川区: { landmarks: ["下町", "隅田川", "谷中"], attrs: { bunka: 7, kurashi: 8 } },
  板橋区: { landmarks: ["石神井川", "中山道", "商店街"], attrs: { kurashi: 8, shizen: 4 } },
  練馬区: { landmarks: ["みどりの街", "公園", "並木道"], attrs: { shizen: 7, kurashi: 7, kaiho: 4 } },
  足立区: { landmarks: ["荒川", "宿場町", "商店街"], attrs: { kurashi: 8, bunka: 5 } },
  葛飾区: { landmarks: ["下町", "寺社", "水辺"], attrs: { kurashi: 8, bunka: 6 } },
  江戸川区: { landmarks: ["親水公園", "水辺", "なぎさ"], attrs: { shizen: 7, kaiho: 6, kurashi: 7 } },
};

// 汎用都市プロファイル（区も判別できない場合）
const GENERIC_PROFILE: { landmarks: string[]; attrs: AttributeVector } = {
  landmarks: ["この街", "日々の場所", "住まいの地"],
  attrs: { kurashi: 7, toshin: 5, keikan: 4, kaiho: 4 },
};

// 事前計算した正規化インデックス
const STATION_INDEX: { key: string; station: Station }[] = STATIONS.flatMap(
  (station) => {
    const keys = new Set<string>([
      normalize(station.name),
      normalize(station.yomi),
      normalize(station.romaji),
      ...(station.aliases ?? []).map(normalize),
    ]);
    return [...keys].map((key) => ({ key, station }));
  }
);

export function resolveStation(input: string): StationProfile | null {
  const q = normalize(input);
  if (!q) return null;

  // 1) 駅の完全一致（名前/読み/ローマ字/別名）
  const exact = STATION_INDEX.find((e) => e.key === q);
  if (exact) {
    const s = exact.station;
    return {
      name: s.name,
      ward: s.ward,
      romaji: s.romaji,
      lines: s.lines,
      landmarks: s.landmarks,
      attrs: s.attrs,
      matchType: "station",
    };
  }

  // 2) 区名でのフォールバック
  for (const [ward, profile] of Object.entries(WARD_PROFILES)) {
    if (wardKeys(ward).includes(q)) {
      return {
        name: ward.replace(/区$/u, ""),
        ward,
        lines: [],
        landmarks: profile.landmarks,
        attrs: profile.attrs,
        matchType: "ward",
      };
    }
  }

  // 3) 汎用フォールバック（入力語をそのまま地名として使う）
  const display = input.normalize("NFKC").trim().replace(/駅$/u, "") || "この街";
  return {
    name: display,
    ward: "",
    lines: [],
    landmarks: GENERIC_PROFILE.landmarks,
    attrs: GENERIC_PROFILE.attrs,
    matchType: "generic",
  };
}

// サジェスト用: 収録駅の一覧（UI で例示するために使う）
export function allStationNames(): string[] {
  return STATIONS.map((s) => s.name);
}
