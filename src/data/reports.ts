import { useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import type {
  AccountBalanceRow,
  CategoryBreakdownRow,
  DailyTrendRow,
  MonthlySummaryRow,
} from '../cloud/database.types'
import { toUserMessage, unwrapRows } from '../lib/errors'
import { monthRange, recentMonths, alignMonthlySeries } from '../lib/transactionView'
import { queryKeys } from '../lib/queryClient'

/**
 * 报表数据层（design.md §5.4 / §6.1 / §7.3）。
 * 一律取 RPC 结果，前端不做金额累加；queryKey 一律含 bookId 与月份/区间。
 */

/** 单条月报：无数据时 book_monthly_summary 仍返回一行全 0 汇总。 */
export function useMonthlySummary(bookId: number | null, month: string) {
  return useQuery({
    queryKey: queryKeys.monthlySummary(bookId, month),
    enabled: bookId !== null,
    queryFn: async (): Promise<MonthlySummaryRow> => {
      if (bookId === null) return emptyMonth(month)
      const rows = unwrapRows<MonthlySummaryRow>(
        await cloud.database.rpc('book_monthly_summary', { p_book_id: bookId, p_month: month }),
      )
      return rows[0] ?? emptyMonth(month)
    },
  })
}

function emptyMonth(month: string): MonthlySummaryRow {
  return {
    month,
    income_cents: 0,
    expense_cents: 0,
    net_cents: 0,
    transfer_cents: 0,
    txn_count: 0,
  }
}

/** 近 N 月趋势：并行调用月报 RPC 后按月份补齐，避免新增服务端函数。 */
export function useMonthlySeries(bookId: number | null, endMonth: string, count = 6) {
  const months = recentMonths(endMonth, count)
  return useQuery({
    queryKey: queryKeys.monthlySeries(bookId, months),
    enabled: bookId !== null,
    queryFn: async (): Promise<MonthlySummaryRow[]> => {
      if (bookId === null) return months.map(emptyMonth)
      const results = await Promise.all(
        months.map((month) =>
          cloud.database.rpc('book_monthly_summary', { p_book_id: bookId, p_month: month }),
        ),
      )
      const rows: MonthlySummaryRow[] = []
      for (const result of results) {
        if (result.error) {
          throw new Error(toUserMessage(result.error), { cause: result.error })
        }
        const data = (result.data ?? []) as MonthlySummaryRow[]
        if (data[0]) rows.push(data[0])
      }
      return alignMonthlySeries(months, rows)
    },
  })
}

export function useCategoryBreakdown(
  bookId: number | null,
  month: string,
  kind: 'expense' | 'income',
) {
  const { from, to } = monthRange(month)
  return useQuery({
    queryKey: queryKeys.categoryBreakdown(bookId, from, to, kind),
    enabled: bookId !== null,
    queryFn: async (): Promise<CategoryBreakdownRow[]> => {
      if (bookId === null) return []
      return unwrapRows<CategoryBreakdownRow>(
        await cloud.database.rpc('category_breakdown', {
          p_book_id: bookId,
          p_from: from,
          p_to: to,
          p_kind: kind,
        }),
      )
    },
  })
}

export function useDailyTrend(bookId: number | null, month: string) {
  const { from, to } = monthRange(month)
  return useQuery({
    queryKey: queryKeys.dailyTrend(bookId, from, to),
    enabled: bookId !== null,
    queryFn: async (): Promise<DailyTrendRow[]> => {
      if (bookId === null) return []
      return unwrapRows<DailyTrendRow>(
        await cloud.database.rpc('daily_trend', {
          p_book_id: bookId,
          p_from: from,
          p_to: to,
        }),
      )
    },
  })
}

/** 账户余额分布：过滤 include_in_total=false 后求和即账本总资产。 */
export function totalAssetCents(rows: AccountBalanceRow[]): number {
  return rows
    .filter((row) => row.include_in_total)
    .reduce((sum, row) => sum + row.balance_cents, 0)
}
