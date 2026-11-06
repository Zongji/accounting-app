import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAccounts, useAccountBalances } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useCurrentBook, useBooks } from '../data/books'
import { useRecentTransactions } from '../data/transactions'
import { totalAssetCents, useMonthlySummary } from '../data/reports'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatCents } from '../lib/money'
import { toUserMessage } from '../lib/errors'
import { RecentTransactions } from '../components/RecentTransactions'
import { useAppStore } from '../store/useAppStore'
import {
  cardClass,
  primaryBtnClass,
  ghostBtnClass,
  TXN_META,
} from '../components/ui'
import { formatMonth } from '../lib/transactionView'

/** §7.1：概览（首页）—— 本月收支、账户余额、最近流水与快捷记账入口。 */
export function OverviewPage() {
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)
  const { isLoading: booksLoading } = useBooks()
  const month = dayjs().format('YYYY-MM')

  const { data: accounts = [] } = useAccounts(bookId)
  const { data: balances = [] } = useAccountBalances(bookId)
  const { data: categories = [] } = useCategoryOptions(bookId)
  const { data: recent = [] } = useRecentTransactions(bookId, 6)
  const { data: summary, isError, error } = useMonthlySummary(bookId, month)
  const openCreate = useAppStore((state) => state.openCreate)

  if (booksLoading) {
    return <div className={cardClass}><p className="text-sm text-slate-400">正在加载账本…</p></div>
  }
  if (bookId === null || !book) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">概览</h1>
        <p className="mt-2 text-sm text-slate-500">请先从账本列表进入一个未归档的账本。</p>
        <Link to="/books" className={`${primaryBtnClass} mt-4 inline-block`}>前往账本列表</Link>
      </div>
    )
  }

  const s = summary ?? {
    month, income_cents: 0, expense_cents: 0, net_cents: 0, transfer_cents: 0, txn_count: 0,
  }
  const totalAsset = totalAssetCents(balances)
  const activeAccounts = accounts.filter((item) => item.archived_at === null)
  const balanceOf = (id: number) => balances.find((item) => item.account_id === id)?.balance_cents ?? null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">
            {book.name} · 概览
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {formatMonth(month)}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">本月收支、账户余额与最近流水</p>
        </div>
        <button type="button" className={primaryBtnClass} onClick={openCreate}>
          + 记一笔
        </button>
      </header>

      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          月报加载失败：{toUserMessage(error)}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">账本总资产</p>
            <p className="tabular mt-1 text-3xl font-semibold text-slate-900">{formatCents(totalAsset)}</p>
            <p className="mt-1 text-[11px] text-slate-400">
              由余额快照实时聚合，仅计入「计入总资产」的账户
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/book/${bookId}/reports`} className={ghostBtnClass}>月度报表</Link>
            <Link to={`/book/${bookId}/transactions`} className={ghostBtnClass}>全部明细</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">本月收入</p>
          <p className="tabular mt-1 text-xl font-semibold" style={{ color: TXN_META.income.color }}>
            {formatCents(s.income_cents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">本月支出</p>
          <p className="tabular mt-1 text-xl font-semibold" style={{ color: TXN_META.expense.color }}>
            {formatCents(s.expense_cents)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">本月结余</p>
          <p className={`tabular mt-1 text-xl font-semibold ${s.net_cents < 0 ? '' : 'text-slate-900'}`}
            style={s.net_cents < 0 ? { color: TXN_META.expense.color } : undefined}>
            {formatCents(s.net_cents)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {s.txn_count} 笔流水 · 转账 {formatCents(s.transfer_cents)} 不计入收支
          </p>
        </div>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">账户余额</h2>
          <Link to={`/book/${bookId}/settings`} className="text-xs text-indigo-600 hover:underline">
            账户配置 →
          </Link>
        </div>
        {activeAccounts.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">还没有账户，去账本设置里新增。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activeAccounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  to={`/book/${bookId}/accounts/${account.id}`}
                  className="truncate text-sm text-slate-700 hover:text-indigo-600 hover:underline"
                >
                  {account.name}
                </Link>
                <span className="tabular shrink-0 text-sm font-medium text-slate-800">
                  {balanceOf(account.id) === null ? '—' : formatCents(balanceOf(account.id)!)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">最近流水</h2>
          <Link to={`/book/${bookId}/transactions`} className="text-xs text-indigo-600 hover:underline">
            查看全部 →
          </Link>
        </div>
        <RecentTransactions transactions={recent} accounts={accounts} categories={categories} />
      </section>
    </div>
  )
}
