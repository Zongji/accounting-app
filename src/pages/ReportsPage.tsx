import { useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAccountBalances } from '../data/accounts'
import { useBooks, useCurrentBook } from '../data/books'
import {
  useCategoryBreakdown,
  useDailyTrend,
  useMonthlySeries,
  useMonthlySummary,
} from '../data/reports'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatMonth, monthRange, shiftMonth } from '../lib/transactionView'
import { formatCents } from '../lib/money'
import { toUserMessage } from '../lib/errors'
import {
  AccountBalanceChart,
  CategoryPieChart,
  DailyTrendChart,
  MonthlyTrendChart,
} from '../components/charts'
import { cardClass, ghostBtnClass, TXN_META } from '../components/ui'

/** §8.2 第 9 步：月度报表 —— 趋势、分类占比、账户余额分布。 */
export function ReportsPage() {
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)
  const { isLoading: booksLoading } = useBooks()
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'))

  const { from, to } = monthRange(month)
  const summary = useMonthlySummary(bookId, month)
  const series = useMonthlySeries(bookId, month, 6)
  const expensePie = useCategoryBreakdown(bookId, month, 'expense')
  const incomePie = useCategoryBreakdown(bookId, month, 'income')
  const daily = useDailyTrend(bookId, month)
  const balances = useAccountBalances(bookId)

  if (booksLoading) {
    return <div className={cardClass}><p className="text-sm text-slate-400">正在加载账本…</p></div>
  }
  if (bookId === null || !book) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">报表</h1>
        <p className="mt-2 text-sm text-slate-500">请先从账本列表进入一个未归档的账本。</p>
        <Link to="/books" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">前往账本列表</Link>
      </div>
    )
  }

  const s = summary.data
  const anyError = [summary.error, series.error, expensePie.error, incomePie.error, daily.error, balances.error]
    .find(Boolean)

  const monthlyData = (series.data ?? []).map((row) => ({
    month: row.month.slice(5),
    income: row.income_cents,
    expense: row.expense_cents,
  }))
  const dailyData = (daily.data ?? []).map((row) => ({
    day: row.day,
    income: row.income_cents,
    expense: row.expense_cents,
  }))
  const expenseCategories = (expensePie.data ?? []).map((row) => ({
    name: row.category_name,
    value: row.total_cents,
    count: row.txn_count,
  }))
  const incomeCategories = (incomePie.data ?? []).map((row) => ({
    name: row.category_name,
    value: row.total_cents,
    count: row.txn_count,
  }))
  const accountData = (balances.data ?? [])
    .filter((row) => row.include_in_total)
    .map((row) => ({ name: row.account_name, balance: row.balance_cents }))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">
            {book.name} · 月度报表
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {formatMonth(month)}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            统计区间 {from} ~ {to} · 转账不计入收入与支出
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="上一月"
            className={ghostBtnClass}
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            ← 上月
          </button>
          <button
            type="button"
            className={ghostBtnClass}
            onClick={() => setMonth(dayjs().format('YYYY-MM'))}
          >
            本月
          </button>
          <button
            type="button"
            aria-label="下一月"
            className={ghostBtnClass}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            下月 →
          </button>
        </div>
      </header>

      {anyError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          报表加载失败：{toUserMessage(anyError)}
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="收入" value={s?.income_cents ?? 0} color={TXN_META.income.color} />
        <Metric label="支出" value={s?.expense_cents ?? 0} color={TXN_META.expense.color} />
        <Metric label="净结余" value={s?.net_cents ?? 0} />
        <Metric label="转账总额" value={s?.transfer_cents ?? 0} color={TXN_META.transfer.color} hint="不计入收支" />
      </section>

      <section className={cardClass}>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800">近 6 个月收支趋势</h2>
          <p className="mt-0.5 text-xs text-slate-400">按 book_monthly_summary 逐月聚合，单位：元（坐标轴）</p>
        </div>
        <MonthlyTrendChart data={monthlyData} />
      </section>

      <section className={cardClass}>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800">本月每日收支</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            daily_trend 补齐无流水日期；转账不计入（§5.4）
          </p>
        </div>
        <DailyTrendChart data={dailyData} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">支出分类占比</h2>
          {expenseCategories.length === 0 ? (
            <EmptyChart hint="本月没有支出流水" />
          ) : (
            <CategoryPieChart data={expenseCategories} />
          )}
        </div>
        <div className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-slate-800">收入分类占比</h2>
          {incomeCategories.length === 0 ? (
            <EmptyChart hint="本月没有收入流水" />
          ) : (
            <CategoryPieChart data={incomeCategories} />
          )}
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-800">账户余额分布</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            取自余额快照，仅显示计入总资产的账户；负债以红色显示
          </p>
        </div>
        {accountData.length === 0 ? (
          <EmptyChart hint="还没有账户余额" />
        ) : (
          <AccountBalanceChart data={accountData} />
        )}
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        所有金额均以「分」整数从 RPC 返回，图表仅在 Tooltip 与坐标轴格式化为元；
        分类占比排除转账，未分类归入「其他」；软删除流水不计入任何报表（§5.4 / §5.6）。
      </p>
    </div>
  )
}

function Metric({
  label,
  value,
  color,
  hint,
}: {
  label: string
  value: number
  color?: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold" style={{ color: color ?? '#0f172a' }}>
        {formatCents(value)}
      </p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function EmptyChart({ hint }: { hint: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">
      {hint}
    </div>
  )
}
