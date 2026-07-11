"use client";

import { useRef, useState } from "react";
import { generatePoem, type PoemResult } from "@/lib/poem";
import { AXIS_THEMES } from "@/lib/image";
import { AXIS_LABELS } from "@/lib/attributes";
import { shareOrDownload } from "@/lib/share";

const EXAMPLES = ["恵比寿", "豊洲", "田園調布", "日本橋", "北千住", "神楽坂"];

export default function Home() {
  const [input, setInput] = useState("");
  const [reroll, setReroll] = useState(0);
  const [result, setResult] = useState<PoemResult | null>(null);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function run(value: string, rerollN: number) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setResult(generatePoem(trimmed, rerollN));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReroll(0);
    run(input, 0);
  }

  function onExample(name: string) {
    setInput(name);
    setReroll(0);
    run(name, 0);
  }

  function onReroll() {
    const next = reroll + 1;
    setReroll(next);
    run(input, next);
  }

  async function onShare() {
    if (!cardRef.current || !result) return;
    setSharing(true);
    try {
      await shareOrDownload({
        node: cardRef.current,
        filename: `mansion-poem-${result.place}.png`,
        title: "マンションポエムメーカー",
        text: `${result.place}のマンションポエムを生成しました。`,
      });
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="min-h-screen mx-auto max-w-2xl px-5 py-10 flex flex-col items-center">
      <header className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">
          マンションポエムメーカー
        </h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          駅名を入れると、その街の空気をまとった
          <br className="sm:hidden" />
          架空の「マンションポエム」を生成します。
        </p>
      </header>

      <form onSubmit={onSubmit} className="w-full max-w-md">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="駅名を入力（例：恵比寿）"
            className="flex-1 rounded-lg bg-slate-800/80 border border-slate-600 px-4 py-3 text-base outline-none focus:border-amber-400 placeholder:text-slate-500"
            aria-label="駅名"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-500 text-slate-900 font-bold px-5 py-3 hover:bg-amber-400 transition-colors"
          >
            詠む
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2 justify-center">
        {EXAMPLES.map((name) => (
          <button
            key={name}
            onClick={() => onExample(name)}
            className="text-xs rounded-full border border-slate-600 px-3 py-1 text-slate-300 hover:border-amber-400 hover:text-amber-300 transition-colors"
          >
            {name}
          </button>
        ))}
      </div>

      {result && (
        <section className="mt-9 w-full flex flex-col items-center">
          <PoemCard result={result} cardRef={cardRef} />

          <div className="mt-5 flex gap-3">
            <button
              onClick={onReroll}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-amber-400 transition-colors"
            >
              別の一編を詠む
            </button>
            <button
              onClick={onShare}
              disabled={sharing}
              className="rounded-lg bg-slate-100 text-slate-900 font-semibold px-4 py-2 text-sm hover:bg-white transition-colors disabled:opacity-60"
            >
              {sharing ? "画像を生成中…" : "画像で共有・保存"}
            </button>
          </div>

          <MetaLine result={result} />
        </section>
      )}

      <footer className="mt-14 max-w-md text-center text-[11px] leading-relaxed text-slate-500">
        本サービスが生成する物件名・キャッチコピー・画像はすべて
        <strong className="text-slate-400">架空（パロディ）</strong>
        です。実在の物件・企業・広告とは一切関係ありません。
        エリアの傾向は一般的なイメージに基づく戯画化であり、正確性を保証するものではありません。
      </footer>
    </main>
  );
}

// 縦書きの最長行がカード高さに収まるようフォントサイズを決定的に算出
function poemFontSize(poem: string[]): number {
  const maxLen = Math.max(1, ...poem.map((l) => l.length));
  const usableHeight = 340; // top-6/bottom-24 を差し引いた縦書き領域の目安(px)
  const size = Math.floor(usableHeight / (maxLen * 1.35));
  return Math.max(13, Math.min(22, size));
}

function PoemCard({
  result,
  cardRef,
}: {
  result: PoemResult;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const theme = AXIS_THEMES[result.themeAxis];
  return (
    <div
      ref={cardRef}
      className="relative w-[340px] h-[453px] rounded-xl overflow-hidden shadow-2xl"
      style={{ backgroundColor: theme.from }}
    >
      {/* 背景画像（SVGフォールバック or 生成画像） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={result.image.src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* 可読性のためのグラデーション */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* エリアタグ */}
      <div className="absolute top-4 left-4 text-[11px] tracking-widest">
        <span style={{ color: theme.accent }}>◆</span>{" "}
        <span style={{ color: theme.ink }}>
          {result.ward || "TOKYO"}
        </span>
      </div>

      {/* ポエム本文（縦書き） */}
      <div className="absolute top-6 right-6 bottom-24 flex justify-end">
        <div
          className="vertical-rl"
          style={{
            color: theme.ink,
            fontSize: `${poemFontSize(result.poem)}px`,
            lineHeight: 1.9,
            textShadow: "0 1px 8px rgba(0,0,0,0.65)",
          }}
        >
          {result.poem.map((line, i) => (
            <p key={i} style={{ whiteSpace: "nowrap", margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* 物件名・立地 */}
      <div className="absolute left-5 right-5 bottom-5">
        <div
          className="text-[15px] font-bold tracking-wider"
          style={{ color: theme.ink }}
        >
          {result.propertyName}
        </div>
        <div
          className="mt-1 text-[11px] tracking-wide"
          style={{ color: theme.accent }}
        >
          {result.lines[0] ? `${result.lines[0]}／` : ""}
          「{result.place}」駅 徒歩{result.walkMinutes}分（予定）
        </div>
      </div>
    </div>
  );
}

function MetaLine({ result }: { result: PoemResult }) {
  const label =
    result.matchType === "station"
      ? "収録駅"
      : result.matchType === "ward"
      ? "区プロファイルから生成"
      : "汎用プロファイルから生成";
  return (
    <p className="mt-4 text-[11px] text-slate-500 text-center">
      {label}・作風：
      {result.themeAxes.map((ax) => AXIS_LABELS[ax]).join(" × ")}
    </p>
  );
}
