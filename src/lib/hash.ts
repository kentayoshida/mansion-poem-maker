// 入力から決定的な数値ハッシュを生成する
// 同じ入力からは同じ結果が出るが、salt を変えると別系列のハッシュになる
// （your-own-devil-fruit-maker の hash.ts をベースに流用）

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// FNV-1a ベース、Unicode コードポイントを直接処理
export function hashString(input: string, salt: number = 0): number {
  const normalized = input.trim().toLowerCase().normalize("NFKC");
  let h = FNV_OFFSET ^ (salt | 0);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.codePointAt(i)!;
    h ^= code;
    // Math.imul で 32bit 整数演算
    h = Math.imul(h, FNV_PRIME);
  }
  // 符号なし32bit
  return h >>> 0;
}

// xorshift32 ベースの擬似乱数生成器
// シード値から決定的に数列を生成する
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // シードが 0 だと xorshift が壊れるので保証
    this.state = (seed | 0) === 0 ? 1 : seed | 0;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return (this.state >>> 0) / 0x100000000;
  }

  // 0以上 max未満の整数
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  // 配列からランダムに1つ選ぶ
  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  // 重み付き選択
  // weights は [{value, weight}] 形式
  weightedPick<T>(items: readonly { value: T; weight: number }[]): T {
    const total = items.reduce((sum, it) => sum + it.weight, 0);
    let r = this.next() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) return item.value;
    }
    return items[items.length - 1].value;
  }
}
