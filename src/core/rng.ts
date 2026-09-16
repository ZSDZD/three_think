/**
 * 带种子的伪随机数发生器。
 *
 * agent.md §5 要求：洗牌等随机行为必须走带种子的 PRNG，并把种子写进对局记录。
 * 这样复盘、Bug 复现、以及将来的联机同步都不需要额外机制。
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, maxExclusive) 的整数 */
  int(maxExclusive: number): number;
}

/** mulberry32：小而快，分布足够均匀，适合棋牌洗牌 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
  };
}

/** Fisher-Yates 洗牌，返回新数组，不修改入参 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
