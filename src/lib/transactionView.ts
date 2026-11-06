import dayjs from 'dayjs'
import type { MonthlySummaryRow, TransactionRow } from '../cloud/database.types'
import type { TransactionFilters } from '../store/useAppStore'

/**
 * 明细/报表展示层的纯逻辑（design.md §7.1 / §5.4 / §5.5）。
 * 与 SDK、数据库无关，便于用 Vitest 覆盖筛选、按天分组、月份边界与趋势口径。
 */

/** 名称查找表：把 id 映射成可展示文本，用于关键字搜索与转账方向标题。 */
export interface NameLookup {
  accountName: (id: number | null) => string
  categoryName: (id: number | null) => string
}

export const EMPTY_LOOKUP: NameLookup = {
  accountName: (id) => (id === null ? '—' : `账户 #${id}`),
  categoryName: (id) => (id === null ? '未分类' : `分类 #${id}`),
}

/** 一个月 'YYYY-MM' 的首末日（含端点），供报表 RPC 的 p_from / p_to 使用。 */
export function monthRange(month: string): { from: string; to: string } {
  const start = dayjs(`${month}-01`)
  if (!start.isValid()) throw new Error('月份格式无效')
  return {
    from: start.format('YYYY-MM-DD'),
    to: start.endOf('month').format('YYYY-MM-DD'),
  }
}

/** 月份加减，返回 'YYYY-MM'。 */
export function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM')
}

/** 以 endMonth 结尾的近 count 个月（升序），用于月度趋势 X 轴。 */
export function recentMonths(endMonth: string, count = 6): string[] {
  return Array.from({ length: count }, (_, index) =>
    shiftMonth(endMonth, index - count + 1),
  )
}

/** 'YYYY-MM' → '2026 年 11 月'。 */
export function formatMonth(month: string): string {
  const d = dayjs(`${month}-01`)
  return d.isValid() ? `${d.year()} 年 ${d.month() + 1} 月` : month
}

/** 'YYYY-MM-DD' → '11 月 6 日'。 */
export function formatDayLabel(day: string): string {
  const d = dayjs(day)
  return d.isValid() ? `${d.month() + 1} 月 ${d.date()} 日` : day
}

export function localDay(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD')
}

/**
 * 明细筛选（§7.1：账户/分类/时间/关键字）。
 *
 * 账户筛选对转账要同时命中主账户与对手账户（§5.5），否则在转入账户视角
 * 会漏掉这笔转账。时间用本地日历日比较，与 p_from/p_to 的展示口径一致。
 * 关键字匹配备注、标签、分类名、主/对手账户名，大小写不敏感。
 */
export function filterTransactions(
  rows: TransactionRow[],
  filters: TransactionFilters,
  lookup: NameLookup = EMPTY_LOOKUP,
): TransactionRow[] {
  const keyword = filters.keyword.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.accountId !== null) {
      const id = filters.accountId
      if (row.account_id !== id && row.counter_account_id !== id) return false
    }
    if (filters.categoryId !== null && row.category_id !== filters.categoryId) return false

    const day = localDay(row.occurred_at)
    if (filters.from !== '' && day < filters.from) return false
    if (filters.to !== '' && day > filters.to) return false

    if (keyword !== '') {
      const haystack = [
        row.note ?? '',
        row.tags.join(' '),
        lookup.categoryName(row.category_id),
        lookup.accountName(row.account_id),
        lookup.accountName(row.counter_account_id),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    return true
  })
}

export interface DayGroup {
  day: string
  rows: TransactionRow[]
  incomeCents: number
  expenseCents: number
}

/**
 * 按本地日历日分组（倒序），每组给收入/支出小计。
 * 转账不计入收支小计（§5.4），避免虚增。
 */
export function groupByDay(rows: TransactionRow[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const row of rows) {
    const day = localDay(row.occurred_at)
    let group = groups.get(day)
    if (!group) {
      group = { day, rows: [], incomeCents: 0, expenseCents: 0 }
      groups.set(day, group)
    }
    group.rows.push(row)
    if (row.type === 'income') group.incomeCents += row.amount_cents
    else if (row.type === 'expense') group.expenseCents += row.amount_cents
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) =>
        b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id,
      ),
    }))
    .sort((a, b) => b.day.localeCompare(a.day))
}

/** 该账户视角下的一条流水金额（含符号）：复用于账户详情与转账两侧展示。 */
export function displayAmountCents(row: TransactionRow, viewAccountId?: number): number {
  if (row.type === 'income' && (viewAccountId === undefined || row.account_id === viewAccountId)) {
    return row.amount_cents
  }
  if (row.type === 'expense' && (viewAccountId === undefined || row.account_id === viewAccountId)) {
    return -row.amount_cents
  }
  if (row.type === 'transfer') {
    if (viewAccountId === row.counter_account_id) return row.amount_cents
    if (viewAccountId === row.account_id) return -(row.amount_cents + row.fee_cents)
    return 0
  }
  return 0
}

/** 近 N 月月报结果按月份索引合并；缺失的月份补零，保证图表连续。 */
export function alignMonthlySeries(
  months: string[],
  rows: MonthlySummaryRow[],
): MonthlySummaryRow[] {
  const byMonth = new Map(rows.map((row) => [row.month, row]))
  return months.map(
    (month) =>
      byMonth.get(month) ?? {
        month,
        income_cents: 0,
        expense_cents: 0,
        net_cents: 0,
        transfer_cents: 0,
        txn_count: 0,
      },
  )
}

/** 饼图占比：保留一位小数，总和恒为 100（避免浮点导致 99.9）。 */
export function toPercent(part: number, total: number): number {
  if (total <= 0 || part <= 0) return 0
  return Math.round((part / total) * 1000) / 10
}
