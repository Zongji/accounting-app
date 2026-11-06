import { QueryClient } from '@tanstack/react-query'

/**
 * 服务端状态统一交给 TanStack Query。
 * 约定（design.md §7.3）：所有账本相关 queryKey 必须包含 currentBookId，
 * 切换账本时整棵 key 自动失效并重新拉取，杜绝 A 账本数据串到 B 账本。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

export const queryKeys = {
  session: () => ['session'] as const,
  books: (bookId: number | null) => ['books', bookId] as const,
  bookList: () => ['books', 'list'] as const,
  accounts: (bookId: number | null) => ['accounts', bookId] as const,
  categories: (bookId: number | null) => ['categories', bookId] as const,
  /** 分类下拉同时取内置模板与账本自定义，按 kind 再过滤 */
  categoryOptions: (bookId: number | null) => ['category-options', bookId] as const,
  /** 账户被流水引用的集合，用于判断能否物理删除（§5.6） */
  accountUsage: (bookId: number | null) => ['account-usage', bookId] as const,
  transactions: (bookId: number | null) => ['transactions', bookId] as const,
  /** 明细页全量流水（前端再做筛选/按天分组），与 recent 分开缓存 */
  transactionsAll: (bookId: number | null) => ['transactions', bookId, 'all'] as const,
  recentTransactions: (bookId: number | null) => ['transactions', bookId, 'recent'] as const,
  transaction: (bookId: number | null, txnId: number | null) =>
    ['transaction', bookId, txnId] as const,
  balanceSnapshot: (bookId: number | null) => ['balance-snapshot', bookId] as const,
  monthlySummary: (bookId: number | null, month: string) =>
    ['monthly-summary', bookId, month] as const,
  /** 近 N 月月度趋势：并行调用 book_monthly_summary 后合并 */
  monthlySeries: (bookId: number | null, months: string[]) =>
    ['monthly-series', bookId, months.join(',')] as const,
  categoryBreakdown: (bookId: number | null, from: string, to: string, kind: string) =>
    ['category-breakdown', bookId, from, to, kind] as const,
  dailyTrend: (bookId: number | null, from: string, to: string) =>
    ['daily-trend', bookId, from, to] as const,
  foundation: (bookId: number | null) => ['foundation', bookId] as const,
}

/** 切换当前账本时调用：使所有账本维度的缓存失效（保留会话相关缓存）。 */
export function invalidateBookQueries(): void {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const scope = query.queryKey[0]
      return typeof scope === 'string' && scope !== 'session'
    },
  })
}
