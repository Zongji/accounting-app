import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAccounts, useAccountBalances } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useBooks, useCurrentBook } from '../data/books'
import { useTransactions } from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatCents } from '../lib/money'
import { buildLookup, TransactionList } from '../components/TransactionList'
import { filterTransactions } from '../lib/transactionView'
import { TXN_META, cardClass, ghostBtnClass, inputClass, primaryBtnClass } from '../components/ui'
import { useAppStore } from '../store/useAppStore'
import { toUserMessage } from '../lib/errors'

/** §8.2 第 8 步：流水明细，按天分组，支持账户/分类/时间/关键字筛选。 */
export function TransactionsPage() {
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)
  const { isLoading: booksLoading } = useBooks()
  const { data: accounts = [] } = useAccounts(bookId)
  const { data: categories = [] } = useCategoryOptions(bookId)
  const { data: balances = [] } = useAccountBalances(bookId)
  const { data: rows = [], isLoading, isError, error } = useTransactions(bookId)

  const filters = useAppStore((state) => state.filters)
  const patchFilters = useAppStore((state) => state.patchFilters)
  const openCreate = useAppStore((state) => state.openCreate)

  const lookup = useMemo(() => buildLookup(accounts, categories), [accounts, categories])
  const visible = useMemo(
    () => filterTransactions(rows, filters, lookup),
    [rows, filters, lookup],
  )
  const totals = useMemo(
    () => ({
      income: visible.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount_cents, 0),
      expense: visible.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount_cents, 0),
    }),
    [visible],
  )
  const hasFilter =
    filters.keyword !== '' ||
    filters.accountId !== null ||
    filters.categoryId !== null ||
    filters.from !== '' ||
    filters.to !== ''
  const totalAsset = balances
    .filter((item) => item.include_in_total)
    .reduce((sum, item) => sum + item.balance_cents, 0)

  if (booksLoading) {
    return <div className={cardClass}><p className="text-sm text-slate-400">正在加载账本…</p></div>
  }
  if (bookId === null || !book) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">流水明细</h1>
        <p className="mt-2 text-sm text-slate-500">请先从账本列表进入一个未归档的账本。</p>
        <Link to="/books" className={`${primaryBtnClass} mt-4 inline-block`}>前往账本列表</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">流水明细</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{book.name}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            账本总资产 <span className="tabular font-medium text-slate-700">{formatCents(totalAsset)}</span>
            {' · '}共 {rows.length} 条流水
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/book/${bookId}/reports`} className={ghostBtnClass}>查看报表</Link>
          <button type="button" className={primaryBtnClass} onClick={openCreate}>记一笔</button>
        </div>
      </header>

      {/* 筛选栏：字段值全部落在 Zustand filters，queryKey 仍只含 bookId（筛选在前端做） */}
      <section className={`${cardClass} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">筛选</h2>
          {hasFilter && (
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline"
              onClick={() => patchFilters({ keyword: '', accountId: null, categoryId: null, from: '', to: '' })}
            >
              清空筛选
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            aria-label="关键字搜索"
            className={inputClass}
            placeholder="备注 / 标签 / 账户 / 分类"
            value={filters.keyword}
            onChange={(event) => patchFilters({ keyword: event.target.value })}
          />
          <select
            aria-label="按账户筛选"
            className={inputClass}
            value={filters.accountId ?? ''}
            onChange={(event) =>
              patchFilters({ accountId: event.target.value === '' ? null : Number(event.target.value) })
            }
          >
            <option value="">全部账户</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select
            aria-label="按分类筛选"
            className={inputClass}
            value={filters.categoryId ?? ''}
            onChange={(event) =>
              patchFilters({ categoryId: event.target.value === '' ? null : Number(event.target.value) })
            }
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              aria-label="开始日期"
              type="date"
              className={inputClass}
              value={filters.from}
              onChange={(event) => patchFilters({ from: event.target.value })}
            />
            <span className="shrink-0 text-xs text-slate-400">至</span>
            <input
              aria-label="结束日期"
              type="date"
              className={inputClass}
              value={filters.to}
              onChange={(event) => patchFilters({ to: event.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          账户筛选会同时命中转账的转出与转入账户；转账不计入收支合计（§5.4 / §5.5）。
        </p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-[11px] text-slate-400">筛选结果</p>
          <p className="tabular mt-1 text-lg font-semibold text-slate-800">{visible.length} 笔</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-[11px] text-slate-400">收入合计</p>
          <p className="tabular mt-1 text-lg font-semibold" style={{ color: TXN_META.income.color }}>
            {formatCents(totals.income)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <p className="text-[11px] text-slate-400">支出合计</p>
          <p className="tabular mt-1 text-lg font-semibold" style={{ color: TXN_META.expense.color }}>
            {formatCents(totals.expense)}
          </p>
        </div>
      </section>

      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          流水加载失败：{toUserMessage(error)}
        </p>
      )}
      {isLoading ? (
        <div className={cardClass}><p className="text-sm text-slate-400">正在加载流水…</p></div>
      ) : (
        <TransactionList
          rows={visible}
          accounts={accounts}
          categories={categories}
          bookId={bookId}
          emptyHint={hasFilter ? '没有符合筛选条件的流水，试试清空筛选' : '还没有流水，点「记一笔」写入第一条'}
        />
      )}
    </div>
  )
}
