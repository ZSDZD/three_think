import { describe, expect, it } from 'vitest';
import {
  activeBidders,
  applyBiddingAction,
  createBidding,
  creditLimit,
  currentBidder,
  minLegalBid,
  type BiddingOutcome,
  type BiddingState,
} from '../src/core/bidding';
import { MORTGAGE_LOAN } from '../src/config/constants';
import type { Player, PlayerId } from '../src/core/types';

function makePlayer(id: PlayerId, cash = 30, unmortgaged = 2): Player {
  return {
    id,
    name: id.toUpperCase(),
    color: '#000000',
    cash,
    shares: Array.from({ length: unmortgaged }, (_, i) => ({
      id: `${id}-share-${i}`,
      good: 'jade' as const,
      mortgaged: false,
    })),
    accomplicesTotal: 3,
  };
}

const players: readonly Player[] = [makePlayer('a'), makePlayer('b'), makePlayer('c')];
const ORDER = ['a', 'b', 'c'] as const;

function start(incumbent: PlayerId | null = null, starter: PlayerId = 'a'): BiddingState {
  return createBidding(ORDER, starter, incumbent);
}

/** 断言成功并返回新状态，失败时让测试报出具体错误 */
function unwrap(outcome: BiddingOutcome): BiddingState {
  if (!outcome.ok) throw new Error(`预期成功，实际失败: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.state;
}

function expectFailure(outcome: BiddingOutcome, code: string): void {
  expect(outcome.ok).toBe(false);
  if (outcome.ok) return;
  expect(outcome.error.code).toBe(code);
}

describe('竞标：基本轮转', () => {
  it('起叫者先行动，起拍价最低 1 元', () => {
    const s = start();
    expect(currentBidder(s)).toBe('a');
    expect(minLegalBid(s)).toBe(1);
  });

  it('出价必须高于当前最高价', () => {
    const s = unwrap(applyBiddingAction(start(), players, { type: 'bid', playerId: 'a', amount: 5 }));
    expect(currentBidder(s)).toBe('b');
    expect(minLegalBid(s)).toBe(6);
    expectFailure(
      applyBiddingAction(s, players, { type: 'bid', playerId: 'b', amount: 5 }),
      'amount-too-low',
    );
    expectFailure(
      applyBiddingAction(s, players, { type: 'bid', playerId: 'b', amount: 1 }),
      'amount-too-low',
    );
  });

  it('出价必须是整数', () => {
    expectFailure(
      applyBiddingAction(start(), players, { type: 'bid', playerId: 'a', amount: 2.5 }),
      'amount-not-integer',
    );
  });

  it('不是自己的回合不能行动', () => {
    expectFailure(
      applyBiddingAction(start(), players, { type: 'bid', playerId: 'b', amount: 3 }),
      'not-your-turn',
    );
  });

  it('起叫者过牌后，由左邻（顺时针下一位）接手起叫', () => {
    // 规则：「如果开始竞标的玩家 pass，则改由他左边的玩家开始，以顺时针方向依此类推。」
    const s = unwrap(applyBiddingAction(start(), players, { type: 'pass', playerId: 'a' }));
    expect(currentBidder(s)).toBe('b');
  });
});

describe('竞标：过牌者退出', () => {
  it('过牌者本段航程不再获得行动权', () => {
    let s = unwrap(applyBiddingAction(start(), players, { type: 'pass', playerId: 'a' }));
    expect(activeBidders(s)).toEqual(['b', 'c']);

    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'b', amount: 4 }));
    expect(currentBidder(s)).toBe('c');

    // c 出价后应轮回到 b（a 已过牌，不得被跳过）
    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'c', amount: 5 }));
    expect(currentBidder(s)).toBe('b');
  });

  it('已过牌的玩家不能重新进场', () => {
    // 构造一个「已过牌者恰好轮到他」的状态，直接验证守卫
    const base = start();
    const tampered: BiddingState = { ...base, passed: ['a'], cursor: 0 };
    expectFailure(
      applyBiddingAction(tampered, players, { type: 'bid', playerId: 'a', amount: 3 }),
      'already-passed',
    );
  });
});

describe('竞标：结束条件', () => {
  it('除一人外全部过牌，该人得标，成交价为他自己的出价', () => {
    let s = start();
    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'a', amount: 5 }));
    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'b', amount: 6 }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'c' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'a', amount: 7 }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'b' }));

    expect(s.status).toBe('won');
    expect(s.winner).toBe('a');
    expect(s.paid).toBe(7);
    expect(currentBidder(s)).toBeNull();
  });

  it('只有一人出价、其余全过牌时，以该出价得标', () => {
    let s = start();
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'a' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'bid', playerId: 'b', amount: 5 }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'c' }));

    expect(s.status).toBe('won');
    expect(s.winner).toBe('b');
    expect(s.paid).toBe(5);
  });

  it('全员过牌且存在在任者：在任者连任，成交价 0', () => {
    // 规则：「如果没有玩家参与竞标，上一段航程的港口负责人仍为这个航程的负责人。」
    let s = start('c');
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'a' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'b' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'c' }));

    expect(s.status).toBe('incumbent-holds');
    expect(s.winner).toBe('c');
    expect(s.paid).toBe(0);
  });

  it('全员过牌且无在任者（首段航程）：起叫者以 0 元接任', () => {
    // 原版规则未覆盖此情形，本实现取 docs/design-v1.md 记录的补充规则
    let s = start(null, 'b');
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'b' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'c' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'a' }));

    expect(s.status).toBe('no-bid-default');
    expect(s.winner).toBe('b');
    expect(s.paid).toBe(0);
  });

  it('只剩一人但尚未出价时，竞标不结束，轮到该人', () => {
    let s = start();
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'a' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'b' }));

    expect(s.status).toBe('open');
    expect(currentBidder(s)).toBe('c');
  });

  it('竞标结束后不再接受任何动作', () => {
    let s = start();
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'a' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'b' }));
    s = unwrap(applyBiddingAction(s, players, { type: 'pass', playerId: 'c' }));

    expectFailure(
      applyBiddingAction(s, players, { type: 'bid', playerId: 'a', amount: 5 }),
      'auction-closed',
    );
  });
});

describe('竞标：信用额度', () => {
  it('额度 = 现金 + 未抵押股份 × 12', () => {
    expect(creditLimit(makePlayer('a', 30, 2))).toBe(30 + 2 * MORTGAGE_LOAN);
    expect(creditLimit(makePlayer('a', 0, 0))).toBe(0);
  });

  it('已抵押的股份不计入额度', () => {
    const p: Player = {
      ...makePlayer('a', 10, 0),
      shares: [{ id: 's1', good: 'silk', mortgaged: true }],
    };
    expect(creditLimit(p)).toBe(10);
  });

  it('出价超过额度被拒', () => {
    const poor = makePlayer('a', 10, 1); // 额度 22
    expectFailure(
      applyBiddingAction(start(), [poor, players[1]!, players[2]!], {
        type: 'bid',
        playerId: 'a',
        amount: 23,
      }),
      'over-credit-limit',
    );
  });

  it('出价恰好等于额度被接受', () => {
    const poor = makePlayer('a', 10, 1); // 额度 22
    const s = unwrap(
      applyBiddingAction(start(), [poor, players[1]!, players[2]!], {
        type: 'bid',
        playerId: 'a',
        amount: 22,
      }),
    );
    expect(s.highBid).toBe(22);
  });
});
