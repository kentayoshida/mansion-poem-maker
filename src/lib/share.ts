// 画像生成と共有（your-own-devil-fruit-maker の share.ts をベースに流用）
"use client";

import { toPng } from "html-to-image";

export async function generatePngBlob(
  node: HTMLElement,
  filename: string
): Promise<{ blob: Blob; file: File; dataUrl: string }> {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#0b1020",
  });
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: "image/png" });
  return { blob, file, dataUrl };
}

export async function shareOrDownload(opts: {
  node: HTMLElement;
  filename: string;
  title: string;
  text: string;
  url?: string;
}): Promise<"shared" | "downloaded"> {
  const { node, filename, title, text, url } = opts;
  const { file, dataUrl } = await generatePngBlob(node, filename);

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };

  if (
    typeof nav.share === "function" &&
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] })
  ) {
    try {
      await nav.share({ files: [file], title, text, url });
      return "shared";
    } catch (err: unknown) {
      // ユーザーがキャンセルした場合は何もしない
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        (err as { name: string }).name === "AbortError"
      ) {
        return "shared";
      }
      // 失敗時はダウンロードへフォールスルー
    }
  }

  // フォールバック: ダウンロード
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return "downloaded";
}
