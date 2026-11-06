import { describe, expect, it } from 'vitest'
import type { MonthlySummaryRow, TransactionRow } from '../cloud/database.types'
import type { TransactionFilters } from '../store/useAppStore'
import {
  alignMonthlySeries,
  displayAmountCents,
  filterTransactions,
  formatMonth,
  groupByDay,
  localDay,
  monthRange,
  recentMonths,
  shiftMonth,
  toPercent,
  type NameLookup,
} from './transactionView'

function txn(patch: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 1,
    owner_id: 'u',
    book_id: 3,
    account_id: 1,
    counter_account_id: null,
    category_id: 10,
    type: 'expense',
    amount_cents: 1000,
    fee_cents: 0,
    currency: 'CNY',
    occurred_at: '2026-11-06T02:00:00.000Z',
    note: '午餐',
    tags: ['餐饮'],
    attachment_urls: [],
    client_token: 't1',
    deleted_at: null,
    created_at: '2026-11-06T02:00:00.000Z',
    updated_at: '2026-11-06T02:00:00.000Z',
    ...patch,
  }
}

const filters = (patch: Partial<TransactionFilters> = {}): TransactionFilters => ({
  keyword: '',
  accountId: null,
  categoryId: null,
  from: '',
  to: '',
  ...patch,
})

const LOOKUP: NameLookup = {
  accountName: (id) => ({ 1: '现金', 2: '储蓄卡' } as Record<number, string>)[id ?? -1] ?? '—',
  categoryName: (id) => ({ 10: '餐饮', 20: '工资' } as Record<number, string>)[id ?? -1] ?? '未分类',
}

describe('月份工具', () => {
  it('monthRange 覆盖首末日，含大小月与闰年', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('shiftMonth 跨年，recentMonths 升序且含末月', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(recentMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('formatMonth 中文标签', () => {
    expect(formatMonth('2026-11')).toBe('2026 年 11 月')
  })
})

describe('filterTransactions · 明细筛选', () => {
  const rows = [
    txn({ id: 1, account_id: 1, category_id: 10, note: '午餐', tags: ['餐饮'] }),
    txn({ id: 2, account_id: 2, category_id: 20, type: 'income', amount_cents: 500000, note: '月薪', tags: [] }),
    txn({
      id: 3,
      account_id: 1,
      counter_account_id: 2,
      type: 'transfer',
      category_id: null,
      amount_cents: 10000,
      fee_cents: 100,
      note: '转钱',
      tags: [],
    }),
  ]

  it('无筛选返回全部', () => {
    expect(filterTransactions(rows, filters(), LOOKUP)).toHaveLength(3)
  })

  it('账户筛选对转账同时命中主账户与对手账户（§5.5）', () => {
    const byAccount1 = filterTransactions(rows, filters({ accountId: 1 }), LOOKUP)
    expect(byAccount1.map((r) => r.id)).toEqual([1, 3])
    const byAccount2 = filterTransactions(rows, filters({ accountId: 2 }), LOOKUP)
    expect(byAccount2.map((r) => r.id)).toEqual([2, 3])
  })

  it('分类筛选精确匹配', () => {
    expect(filterTransactions(rows, filters({ categoryId: 20 }), LOOKUP).map((r) => r.id)).toEqual([2])
  })

  it('时间范围按本地日历日比较', () => {
    const day = localDay('2026-11-06T02:00:00.000Z')
    expect(filterTransactions(rows, filters({ from: day, to: day }), LOOKUP)).toHaveLength(3)
    expect(filterTransactions(rows, filters({ from: '2026-12-01' }), LOOKUP)).toHaveLength(0)
  })

  it('关键字匹配备注、标签、分类名与账户名（含对手账户），大小写不敏感', () => {
    expect(filterTransactions(rows, filters({ keyword: '午餐' }), LOOKUP).map((r) => r.id)).toEqual([1])
    expect(filterTransactions(rows, filters({ keyword: '餐饮' }), LOOKUP).map((r) => r.id)).toEqual([1])
    expect(filterTransactions(rows, filters({ keyword: '储蓄卡' }), LOOKUP).map((r) => r.id)).toEqual([2, 3])
    expect(filterTransactions(rows, filters({ keyword: '工资' }), LOOKUP).map((r) => r.id)).toEqual([2])
    expect(filterTransactions(rows, filters({ keyword: '不存在' }), LOOKUP)).toHaveLength(0)
  })

  it('多条件叠加是 AND', () => {
    expect(
      filterTransactions(rows, filters({ accountId: 1, keyword: '午餐' }), LOOKUP).map((r) => r.id),
    ).toEqual([1])
  })
})

describe('groupByDay · 按天分组', () => {
  it('按本地日历日倒序分组，转账不计入收支小计', () => {
    const rows = [
      txn({ id: 1, type: 'expense', amount_cents: 1000, occurred_at: '2026-11-06T02:00:00.000Z' }),
      txn({ id: 2, type: 'income', amount_cents: 5000, occurred_at: '2026-11-06T03:00:00.000Z' }),
      txn({ id: 3, type: 'transfer', amount_cents: 9999, counter_account_id: 2, occurred_at: '2026-11-06T04:00:00.000Z' }),
      txn({ id: 4, type: 'expense', amount_cents: 2000, occurred_at: '2026-11-05T10:00:00.000Z' }),
    ]
    const groups = groupByDay(rows)
    expect(groups.map((g) => g.day)).toEqual(['2026-11-06', '2026-11-05'])
    expect(groups[0].incomeCents).toBe(5000)
    expect(groups[0].expenseCents).toBe(1000)
    expect(groups[0].rows.map((r) => r.id)).toEqual([3, 2, 1])
    expect(groups[1].expenseCents).toBe(2000)
  })

  it('空数组返回空分组', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('displayAmountCents · 账户视角金额', () => {
  it('支出负、收入正，指定账户视角保持一致', () => {
    expect(displayAmountCents(txn({ type: 'expense', amount_cents: 1000 }))).toBe(-1000)
    expect(displayAmountCents(txn({ type: 'income', amount_cents: 1000 }))).toBe(1000)
    expect(displayAmountCents(txn({ type: 'expense', amount_cents: 1000 }), 1)).toBe(-1000)
    expect(displayAmountCents(txn({ type: 'expense', amount_cents: 1000 }), 2)).toBe(0)
  })

  it('转账两侧一增一减，手续费只从转出方扣', () => {
    const row = txn({ type: 'transfer', account_id: 1, counter_account_id: 2, amount_cents: 10000, fee_cents: 100 })
    expect(displayAmountCents(row, 1)).toBe(-10100)
    expect(displayAmountCents(row, 2)).toBe(10000)
    expect(displayAmountCents(row, 3)).toBe(0)
    expect(displayAmountCents(row)).toBe(0)
  })
})

describe('alignMonthlySeries / toPercent', () => {
  const month = (m: string, income: number, expense: number): MonthlySummaryRow => ({
    month: m,
    income_cents: income,
    expense_cents: expense,
    net_cents: income - expense,
    transfer_cents: 0,
    txn_count: 1,
  })

  it('缺失月份补零，顺序与 months 一致', () => {
    const months = ['2026-09', '2026-10', '2026-11']
    const series = alignMonthlySeries(months, [month('2026-11', 5000, 1000)])
    expect(series.map((r) => [r.month, r.income_cents, r.expense_cents])).toEqual([
      ['2026-09', 0, 0],
      ['2026-10', 0, 0],
      ['2026-11', 5000, 1000],
    ])
  })

  it('占比保留一位小数，分母为 0 时返回 0', () => {
    expect(toPercent(1, 3)).toBe(33.3)
    expect(toPercent(3, 3)).toBe(100)
    expect(toPercent(1, 0)).toBe(0)
  })
})
