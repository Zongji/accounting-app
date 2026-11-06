import type { AccountRow, CategoryRow, TransactionRow } from '../cloud/database.types'
import { formatCents } from '../lib/money'
import { TXN_META, formatDateTime } from './ui'

interface Props {
  transactions: TransactionRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  emptyHint?: string
}

/**
 * 只读的最近流水（本阶段用它验收「记一笔」确实写进了云端）。
 * 完整的明细筛选、编辑与软删除属于 §8.2 第 8 步。
 */
export function RecentTransactions({ transactions, accounts, categories, emptyHint = '还没有流水' }: Props) {
  const accountName = (id: number | null) =>
    id === null ? '—' : (accounts.find((item) => item.id === id)?.name ?? `账户 #${id}`)
  const categoryName = (id: number | null) =>
    id === null ? '未分类' : (categories.find((item) => item.id === id)?.name ?? '未分类')

  return (
    <div className="divide-y divide-slate-100">
      {transactions.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">{emptyHint}</p>
      )}
      {transactions.map((txn) => {
        const meta = TXN_META[txn.type]
        const title =
          txn.type === 'transfer'
            ? `${accountName(txn.account_id)} → ${accountName(txn.counter_account_id)}`
            : categoryName(txn.category_id)
        return (
          <div key={txn.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{title}</p>
              <p className="mt-1 truncate text-xs text-slate-400">
                <span className="mr-1.5 font-medium" style={{ color: meta.color }}>
                  {meta.label}
                </span>
                {formatDateTime(txn.occurred_at)}
                {' · '}
                {txn.type === 'transfer' ? '账户互转' : accountName(txn.account_id)}
                {txn.note ? ` · ${txn.note}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular text-sm font-semibold" style={{ color: meta.color }}>
                {meta.sign}
                {formatCents(txn.amount_cents)}
              </p>
              {txn.type === 'transfer' && txn.fee_cents > 0 && (
                <p className="tabular mt-0.5 text-[11px] text-slate-400">
                  手续费 {formatCents(txn.fee_cents)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
