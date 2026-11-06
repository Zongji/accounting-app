import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  assertTransactionShape,
  bookTotalDeltaCents,
  deltaCentsForAccount,
  formatCents,
  parseCents,
  parsePositiveCents,
  parseSignedCents,
  type TxnShape,
} from './money'

const income = (amount_cents: number, account_id = 1): TxnShape => ({
  type: 'income',
  account_id,
  counter_account_id: null,
  amount_cents,
  fee_cents: 0,
})

const expense = (amount_cents: number, account_id = 1): TxnShape => ({
  type: 'expense',
  account_id,
  counter_account_id: null,
  amount_cents,
  fee_cents: 0,
})

const transfer = (amount_cents: number, fee_cents = 0): TxnShape => ({
  type: 'transfer',
  account_id: 1,
  counter_account_id: 2,
  amount_cents,
  fee_cents,
})

describe('parseCents · 金额精度边界', () => {
  it('解析整数、小数、千分位与货币符号', () => {
    expect(parseCents('1')).toBe(100)
    expect(parseCents('0.01')).toBe(1)
    expect(parseCents('1.5')).toBe(150)
    expect(parseCents('.5')).toBe(50)
    expect(parseCents('¥ 1,234.56')).toBe(123456)
    expect(parseCents('￥2,000')).toBe(200000)
    expect(parseCents(0.01)).toBe(1)
  })

  it('拒绝负数、空值、非数字与超过两位小数', () => {
    expect(() => parseCents('')).toThrow(MoneyError)
    expect(() => parseCents('abc')).toThrow(MoneyError)
    expect(() => parseCents('-1')).toThrow(MoneyError)
    expect(() => parseCents(-1)).toThrow(MoneyError)
    expect(() => parseCents('1.234')).toThrow(MoneyError)
    expect(() => parseCents('1.')).toThrow(MoneyError)
    expect(() => parseCents('1e5')).toThrow(MoneyError)
  })

  it('超大金额不静默溢出', () => {
    expect(() => parseCents('9007199254740991')).toThrow(MoneyError)
  })

  it('流水金额必须大于 0', () => {
    expect(parsePositiveCents('0.01')).toBe(1)
    expect(() => parsePositiveCents('0')).toThrow('金额必须大于 0')
  })
})

describe('parseSignedCents · 账户期初余额可负', () => {
  it('正负数与零都按整数分解析，且不产生 -0', () => {
    expect(parseSignedCents('1234.56')).toBe(123456)
    expect(parseSignedCents('-1234.56')).toBe(-123456)
    expect(parseSignedCents('-0')).toBe(0)
    expect(parseSignedCents(0)).toBe(0)
    expect(parseSignedCents(-0.01)).toBe(-1)
    expect(parseSignedCents('¥ -1,200.30')).toBe(-120030)
  })

  it('仍然拒绝三位小数、双负号与非数字', () => {
    expect(() => parseSignedCents('-1.234')).toThrow(MoneyError)
    expect(() => parseSignedCents('--1')).toThrow(MoneyError)
    expect(() => parseSignedCents('-')).toThrow(MoneyError)
  })
})

describe('formatCents · 展示层', () => {
  it('整数分格式化并保留两位小数', () => {
    expect(formatCents(1)).toBe('¥ 0.01')
    expect(formatCents(123456)).toBe('¥ 1,234.56')
    expect(formatCents(0)).toBe('¥ 0.00')
    expect(formatCents(-123456)).toBe('-¥ 1,234.56')
    expect(formatCents(123456, { withSymbol: false })).toBe('1,234.56')
  })

  it('与 parseCents 往返一致', () => {
    for (const raw of ['0.01', '1', '1.5', '1,234.56', '999999.99']) {
      expect(parseCents(formatCents(parseCents(raw), { withSymbol: false }))).toBe(parseCents(raw))
    }
  })
})

describe('deltaCentsForAccount · 与 SQL 余额口径一致', () => {
  it('收入加、支出减、无关账户为 0', () => {
    expect(deltaCentsForAccount(income(50000), 1)).toBe(50000)
    expect(deltaCentsForAccount(income(50000), 2)).toBe(0)
    expect(deltaCentsForAccount(expense(20000), 1)).toBe(-20000)
    expect(deltaCentsForAccount(expense(20000), 2)).toBe(0)
  })

  it('转账两侧一增一减，手续费只从转出方扣', () => {
    const t = transfer(30000, 100)
    expect(deltaCentsForAccount(t, 1)).toBe(-30100)
    expect(deltaCentsForAccount(t, 2)).toBe(30000)
    expect(deltaCentsForAccount(t, 3)).toBe(0)
  })

  it('无手续费时账本总余额不变；有手续费时只减少手续费', () => {
    expect(bookTotalDeltaCents(transfer(30000))).toBe(0)
    expect(bookTotalDeltaCents(transfer(30000, 100))).toBe(-100)
    expect(bookTotalDeltaCents(income(50000))).toBe(50000)
    expect(bookTotalDeltaCents(expense(20000))).toBe(-20000)
  })

  it('复现数据库自检场景：期初 1000.00 + 5 笔后 A=999.00 / B=300.00', () => {
    const txns: TxnShape[] = [income(50000), expense(20000), transfer(30000, 100)]
    const balanceA = 100000 + txns.reduce((sum, t) => sum + deltaCentsForAccount(t, 1), 0)
    const balanceB = 0 + txns.reduce((sum, t) => sum + deltaCentsForAccount(t, 2), 0)
    expect(balanceA).toBe(99900)
    expect(balanceB).toBe(30000)
    expect(balanceA + balanceB).toBe(129900)
  })
})

describe('assertTransactionShape · 与 ck_txn_accounts 同构', () => {
  it('合法的三种流水通过', () => {
    expect(() => assertTransactionShape(income(1))).not.toThrow()
    expect(() => assertTransactionShape(expense(1))).not.toThrow()
    expect(() => assertTransactionShape(transfer(1, 0))).not.toThrow()
    expect(() => assertTransactionShape(transfer(1, 50))).not.toThrow()
  })

  it('普通收支带对手账户或手续费会被拒绝', () => {
    expect(() => assertTransactionShape({ ...income(1), counter_account_id: 2 })).toThrow('只能关联 1 个账户')
    expect(() => assertTransactionShape({ ...expense(1), fee_cents: 10 })).toThrow('只有转账')
  })

  it('转账必须两个不同账户', () => {
    expect(() => assertTransactionShape({ ...transfer(1), counter_account_id: null })).toThrow('必须选择转入账户')
    expect(() => assertTransactionShape({ ...transfer(1), counter_account_id: 1 })).toThrow('不能相同')
    expect(() => assertTransactionShape({ ...income(1), fee_cents: -1 })).toThrow('手续费不能为负数')
  })
})
