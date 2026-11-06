import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccounts, useAccountBalances } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useCurrentBook } from '../data/books'
import { useTransactions } from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatCents } from '../lib/money'
import { toUserMessage } from '../lib/errors'
import { TransactionList } from '../components/TransactionList'
import { displayAmountCents } from '../lib/transactionView'
import { accountTypeLabel, cardClass, primaryBtnClass } from '../components/ui'
import { useAppStore } from '../store/useAppStore'

/** §7.1：账户详情，余额 + 该账户全部流水（含转账两侧，§5.5）。 */
export function AccountDetailPage() {
  const { accountId: accountIdParam } = useParams<{ accountId: string }>()
  const accountId = Number(accountIdParam)
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)

  const { data: accounts = [] } = useAccounts(bookId)
  const { data: categories = [] } = useCategoryOptions(bookId)
  const { data: balances = [] } = useAccountBalances(bookId)
  const { data: rows = [], isLoading, isError, error } = useTransactions(bookId)
  const openCreate = useAppStore((state) => state.openCreate)

  // 转账会同时出现在转出方与转入方视角：主账户或对手账户命中都要算进来。
  const accountRows = useMemo(
    () =>
      rows.filter(
        (row) => row.account_id === accountId || row.counter_account_id === accountId,
      ),
    [rows, accountId],
  )
  const netFlow = useMemo(
    () => accountRows.reduce((sum, row) => sum + displayAmountCents(row, accountId), 0),
    [accountRows, accountId],
  )

  if (!Number.isSafeInteger(accountId) || accountId <= 0) {
    return <div className={cardClass}><p className="text-sm text-rose-600">无效的账户编号</p></div>
  }

  const account = accounts.find((item) => item.id === accountId)
  const balance = balances.find((item) => item.account_id === accountId)?.balance_cents ?? null

  if (isLoading) {
    return <div className={cardClass}><p className="text-sm text-slate-400">正在加载账户流水…</p></div>
  }
  if (isError) {
    return (
      <div className={cardClass}>
        <p role="alert" className="text-sm text-rose-700">加载失败：{toUserMessage(error)}</p>
      </div>
    )
  }
  if (bookId === null || !account) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">账户不存在</h1>
        <p className="mt-2 text-sm text-slate-500">它可能已被删除，或不属于当前账本。</p>
        <Link to={bookId ? `/book/${bookId}/settings` : '/books'} className={`${primaryBtnClass} mt-4 inline-block`}>
          返回账本设置
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <Link
          to={`/book/${bookId}/settings`}
          className="text-xs text-indigo-600 hover:underline"
        >
          ← 返回账本设置
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-widest text-indigo-500">
          {book?.name ?? '账本'} · 账户详情
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{account.name}</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          {accountTypeLabel(account.type)}
          {!account.include_in_total && ' · 不计入账本总资产'}
          {' · 期初 '}
          <span className="tabular">{formatCents(account.initial_balance_cents)}</span>
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-400">当前余额</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">
            {balance === null ? '—' : formatCents(balance)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">由余额快照实时聚合</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-400">流水笔数</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{accountRows.length}</p>
          <p className="mt-1 text-[11px] text-slate-400">含转账两侧</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-400">累计净流入</p>
          <p className="tabular mt-1 text-2xl font-semibold text-slate-900">
            {netFlow >= 0 ? '+' : ''}{formatCents(netFlow)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">不含期初余额</p>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">该账户的全部流水</h2>
        <button type="button" className={primaryBtnClass} onClick={openCreate}>记一笔</button>
      </div>

      <TransactionList
        rows={accountRows}
        accounts={accounts}
        categories={categories}
        bookId={bookId}
        viewAccountId={accountId}
        emptyHint="该账户还没有流水"
      />

      <p className="text-xs leading-relaxed text-slate-400">
        转账在此视角按方向显示：转出为负（含手续费）、转入为正；同一笔转账也会出现在对手账户的流水里（§5.5）。
      </p>
    </div>
  )
}
