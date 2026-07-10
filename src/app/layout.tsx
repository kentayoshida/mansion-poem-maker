import type { Metadata } from "next";
import "./globals.css";

const SITE_TITLE = "マンションポエムメーカー";
const SITE_DESC =
  "駅名を入れると、その街の空気をまとった架空の『マンションポエム』を生成します。同じ駅なら、いつも同じ一編。";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESC,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
