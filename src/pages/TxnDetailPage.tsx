import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useCurrentBook } from '../data/books'
import {
  useTransaction,
  useSoftDeleteTransaction,
} from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatCents } from '../lib/money'
import { toUserMessage } from '../lib/errors'
import { useAppStore } from '../store/useAppStore'
import { displayAmountCents } from '../lib/transactionView'
import {
  cardClass,
  dangerBtnClass,
  formatDate,
  formatDateTime,
  ghostBtnClass,
  primaryBtnClass,
  TXN_META,
} from '../components/ui'
import { buildLookup } from '../components/TransactionList'

/** §8.2 第 8 步：流水详情，转账显示两个账户与方向；编辑与软删除入口。 */
export function TxnDetailPage() {
  const { txnId: txnIdParam } = useParams<{ txnId: string }>()
  const txnId = Number(txnIdParam)
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)
  const navigate = useNavigate()

  const { data: accounts = [] } = useAccounts(bookId)
  const { data: categories = [] } = useCategoryOptions(bookId)
  const { data: txn, isLoading, isError, error } = useTransaction(bookId, txnId)
  const softDelete = useSoftDeleteTransaction()
  const openEdit = useAppStore((state) => state.openEdit)
  const [pageError, setPageError] = useState<string | null>(null)

  const lookup = buildLookup(accounts, categories)

  if (!Number.isSafeInteger(txnId) || txnId <= 0) {
    return <div className={cardClass}><p className="text-sm text-rose-600">无效的流水编号</p></div>
  }
  if (isLoading) {
    return <div className={cardClass}><p className="text-sm text-slate-400">正在加载流水…</p></div>
  }
  if (isError) {
    return (
      <div className={cardClass}>
        <p role="alert" className="text-sm text-rose-700">加载失败：{toUserMessage(error)}</p>
      </div>
    )
  }
  if (bookId === null || !txn) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">流水不存在</h1>
        <p className="mt-2 text-sm text-slate-500">它可能已被删除，或不属于当前账本。</p>
        <Link to={bookId ? `/book/${bookId}/transactions` : '/books'} className={`${primaryBtnClass} mt-4 inline-block`}>
          返回明细
        </Link>
      </div>
    )
  }

  // early return 后把收窄结果固化到局部常量：闭包（remove）内 TS 不会保留外层收窄。
  const detail = txn
  const activeBookId: number = bookId
  const meta = TXN_META[detail.type]
  const title =
    detail.type === 'transfer'
      ? `${lookup.accountName(detail.account_id)} → ${lookup.accountName(detail.counter_account_id)}`
      : lookup.categoryName(detail.category_id)

  async function remove() {
    const confirmed = window.confirm(
      `删除这笔流水？\n\n${title} · ${formatCents(detail.amount_cents)}\n\n` +
        '这是软删除：相关账户余额与月度报表会立即重算，历史记录不会物理清除。',
    )
    if (!confirmed) return
    setPageError(null)
    try {
      await softDelete.mutateAsync({ bookId: activeBookId, txnId })
      navigate(`/book/${activeBookId}/transactions`, { replace: true })
    } catch (err) {
      setPageError(toUserMessage(err))
    }
  }

  const fields: Array<{ label: string; value: ReactNode }> = [
    { label: '流水类型', value: <span style={{ color: meta.color }} className="font-medium">{meta.label}</span> },
    { label: '金额', value: <span className="tabular font-semibold" style={{ color: meta.color }}>{formatCents(txn.amount_cents)}</span> },
  ]
  if (txn.type === 'transfer') {
    const fromDelta = displayAmountCents(txn, txn.account_id)
    const toDelta = displayAmountCents(txn, txn.counter_account_id ?? undefined)
    fields.push(
      { label: '转出账户', value: lookup.accountName(txn.account_id) },
      { label: '转出方向', value: <span className="tabular" style={{ color: TXN_META.expense.color }}>{formatCents(fromDelta)}</span> },
      { label: '转入账户', value: lookup.accountName(txn.counter_account_id) },
      { label: '转入方向', value: <span className="tabular" style={{ color: TXN_META.income.color }}>+{formatCents(toDelta)}</span> },
      { label: '手续费', value: <span className="tabular">{formatCents(txn.fee_cents)}（从转出方额外扣除）</span> },
    )
  } else {
    fields.push(
      { label: txn.type === 'expense' ? '付款账户' : '收款账户', value: lookup.accountName(txn.account_id) },
      { label: '分类', value: lookup.categoryName(txn.category_id) },
    )
  }
  fields.push(
    { label: '发生时间', value: formatDateTime(txn.occurred_at) },
    { label: '日期', value: formatDate(txn.occurred_at) },
    { label: '备注', value: txn.note || '—' },
    { label: '标签', value: txn.tags.length > 0 ? txn.tags.join('、') : '—' },
    { label: '币种', value: txn.currency },
    { label: '创建时间', value: formatDateTime(txn.created_at) },
    { label: '最近修改', value: formatDateTime(txn.updated_at) },
  )

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <Link
          to={`/book/${bookId}/transactions`}
          className="text-xs text-indigo-600 hover:underline"
        >
          ← 返回明细
        </Link>
        <p className="mt-3 text-xs font-medium uppercase tracking-widest text-indigo-500">
          {book?.name ?? '账本'} · 流水详情
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      </header>

      {pageError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {pageError}
        </p>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs text-slate-400">本笔金额</p>
            <p className="tabular mt-1 text-3xl font-semibold" style={{ color: meta.color }}>
              {meta.sign}{formatCents(txn.amount_cents)}
            </p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
          >
            {meta.label}
          </span>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          {fields.map((field) => (
            <div key={field.label} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-slate-500">{field.label}</dt>
              <dd className="min-w-0 break-words text-right text-slate-800">{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-wrap gap-2">
        <button type="button" className={primaryBtnClass} onClick={() => openEdit(txn)}>
          编辑流水
        </button>
        <button
          type="button"
          className={dangerBtnClass}
          disabled={softDelete.isPending}
          onClick={() => void remove()}
        >
          {softDelete.isPending ? '删除中…' : '删除流水'}
        </button>
        <Link to={`/book/${bookId}/reports`} className={ghostBtnClass}>查看报表</Link>
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        编辑只更新可变字段，不会改动归属账本或幂等令牌；删除为软删除，余额与报表按
        {' '}deleted_at IS NULL 立即重算（§5.6）。
      </p>
    </div>
  )
}
