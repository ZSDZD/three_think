/**
 * 金钱操作：付款、抵押贷款、赎回。
 *
 * 规则来源：http://www.mf8-china.com/archiver/?tid-72459.html
 * - 「对每一张股份，海港的钱箱借款１２元披索。」
 * - 「每张抵押的股份可以藉由偿还贷款加上利息，一共１５元披索到海港的钱箱，变成尚未抵押。」
 * - 「当玩家必须付钱而他没有足够的现金，他必须贷款，如此他才能解决他的承诺。」
 * - 「如果他即使贷款之后仍无法付出理赔金，他付出他能负担的所有金额，剩下的由海港的钱箱负担。」
 */
import { MORTGAGE_LOAN, REDEEM_COST } from '../config/constants';
import type { GoodId, Player } from './types';

export interface RaiseResult {
  readonly player: Player;
  /** 实际筹到的金额 */
  readonly raised: number;
  /** 抵押掉的股份数 */
  readonly mortgaged: number;
  readonly note: string | null;
}

/**
 * 抵押股份筹钱，直到现金达到 needed 为止。
 *
 * 简化：自动挑选**当前单价最低**的未抵押股份先抵押。原版允许玩家自行选择抵押哪一张。
 * 见 docs/design-v1.md §4。
 */
export function raiseCash(
  player: Player,
  needed: number,
  priceOf: (good: GoodId) => number,
): RaiseResult {
  if (player.cash >= needed) {
    return { player, raised: 0, mortgaged: 0, note: null };
  }

  const shares = [...player.shares];
  const order = shares
    .map((share, index) => ({ share, index }))
    .filter(({ share }) => !share.mortgaged)
    .sort((a, b) => priceOf(a.share.good) - priceOf(b.share.good));

  let cash = player.cash;
  let mortgaged = 0;

  for (const { index } of order) {
    if (cash >= needed) break;
    const card = shares[index];
    if (!card || card.mortgaged) continue;
    shares[index] = { ...card, mortgaged: true };
    cash += MORTGAGE_LOAN;
    mortgaged += 1;
  }

  const note =
    mortgaged > 0
      ? `${player.name} 现金不足，抵押 ${mortgaged} 张股份贷款 ${mortgaged * MORTGAGE_LOAN} 元。`
      : null;

  return { player: { ...player, cash, shares }, raised: mortgaged * MORTGAGE_LOAN, mortgaged, note };
}

/** 付款给钱箱：先筹钱，再扣除。返回新玩家与实际扣除额 */
export function payToBank(
  player: Player,
  amount: number,
  priceOf: (good: GoodId) => number,
): { player: Player; paid: number; note: string | null; loaned: number } {
  const raised = raiseCash(player, amount, priceOf);
  const paid = Math.min(amount, raised.player.cash);
  return {
    player: { ...raised.player, cash: raised.player.cash - paid },
    paid,
    note: raised.note,
    loaned: raised.mortgaged,
  };
}

/** 赎回一张抵押股份所需金额（本金 + 利息） */
export function redeemCost(): number {
  return REDEEM_COST;
}

/** 未抵押股份数 */
export function unmortgagedCount(player: Player): number {
  return player.shares.filter((s) => !s.mortgaged).length;
}

/** 信用额度 = 现金 + 未抵押股份 × 12 */
export function creditLimitOf(player: Player): number {
  return player.cash + unmortgagedCount(player) * MORTGAGE_LOAN;
}
