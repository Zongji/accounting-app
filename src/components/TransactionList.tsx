import { useNavigate } from 'react-router-dom'
import type { AccountRow, CategoryRow, TransactionRow } from '../cloud/database.types'
import { formatCents } from '../lib/money'
import { displayAmountCents, formatDayLabel, groupByDay, type NameLookup } from '../lib/transactionView'
import { formatDateTime, TXN_META } from './ui'

/**
 * 按天分组的流水列表（design.md §7.1 / §7.2）。
 * 同一份数据，PC（≥768px）用表格、手机用卡片流，靠 CSS 断点切换，不做两套 UI。
 * viewAccountId 传入时按该账户视角显示转账两侧的 +/− 金额（§5.5）。
 */
interface Props {
  rows: TransactionRow[]
  accounts: AccountRow[]
  categories: CategoryRow[]
  bookId: number
  viewAccountId?: number
  emptyHint?: string
}

export function buildLookup(accounts: AccountRow[], categories: CategoryRow[]): NameLookup {
  const accountMap = new Map(accounts.map((item) => [item.id, item.name]))
  const categoryMap = new Map(categories.map((item) => [item.id, item.name]))
  return {
    accountName: (id) =>
      id === null ? '—' : (accountMap.get(id) ?? `账户 #${id}`),
    categoryName: (id) =>
      id === null ? '未分类' : (categoryMap.get(id) ?? '未分类'),
  }
}

export function TransactionList({
  rows,
  accounts,
  categories,
  bookId,
  viewAccountId,
  emptyHint = '没有符合条件的流水',
}: Props) {
  const navigate = useNavigate()
  const lookup = buildLookup(accounts, categories)
  const groups = groupByDay(rows)

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-400">{emptyHint}</p>
      </div>
    )
  }

  function titleOf(txn: TransactionRow): string {
    return txn.type === 'transfer'
      ? `${lookup.accountName(txn.account_id)} → ${lookup.accountName(txn.counter_account_id)}`
      : lookup.categoryName(txn.category_id)
  }

  function amountOf(txn: TransactionRow): number {
    return displayAmountCents(txn, viewAccountId)
  }

  function amountText(txn: TransactionRow): string {
    const value = amountOf(txn)
    const meta = TXN_META[txn.type]
    if (txn.type === 'transfer') {
      // 转账在没有账户视角（明细页）时展示原始金额，账户详情页才带方向符号。
      const sign = viewAccountId === undefined ? '' : value > 0 ? '+' : value < 0 ? '-' : ''
      return `${sign}${formatCents(Math.abs(value) || txn.amount_cents)}`
    }
    return `${meta.sign}${formatCents(Math.abs(value))}`
  }

  function subLine(txn: TransactionRow): string {
    const bits = [formatDateTime(txn.occurred_at)]
    if (txn.type === 'transfer') bits.push('账户互转')
    else bits.push(lookup.accountName(txn.account_id))
    if (txn.note) bits.push(txn.note)
    if (txn.tags.length > 0) bits.push(txn.tags.join(' · '))
    return bits.join(' · ')
  }

  function amountColor(txn: TransactionRow): string {
    if (txn.type === 'transfer' && viewAccountId !== undefined) {
      const value = amountOf(txn)
      if (value > 0) return TXN_META.income.color
      if (value < 0) return TXN_META.expense.color
    }
    return TXN_META[txn.type].color
  }

  const goDetail = (txnId: number) => navigate(`/book/${bookId}/txn/${txnId}`)

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.day}>
          <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold text-slate-500">{formatDayLabel(group.day)}</p>
            <p className="tabular text-[11px] text-slate-400">
              {group.incomeCents > 0 && (
                <span className="mr-2" style={{ color: TXN_META.income.color }}>
                  收 {formatCents(group.incomeCents)}
                </span>
              )}
              {group.expenseCents > 0 && (
                <span style={{ color: TXN_META.expense.color }}>
                  支 {formatCents(group.expenseCents)}
                </span>
              )}
            </p>
          </div>

          {/* PC：可排序感更强的紧凑表格 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">项目</th>
                  <th className="px-4 py-2 font-medium">类型</th>
                  <th className="px-4 py-2 font-medium">时间 / 备注</th>
                  <th className="px-4 py-2 text-right font-medium">金额</th>
                  <th className="w-10 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {group.rows.map((txn) => (
                  <tr
                    key={txn.id}
                    onClick={() => goDetail(txn.id)}
                    className="cursor-pointer transition hover:bg-indigo-50/50"
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800">{titleOf(txn)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: TXN_META[txn.type].color, backgroundColor: `${TXN_META[txn.type].color}14` }}
                      >
                        {TXN_META[txn.type].label}
                      </span>
                    </td>
                    <td className="max-w-[22rem] truncate px-4 py-2.5 text-xs text-slate-400">
                      {subLine(txn)}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2.5 text-right font-semibold" style={{ color: amountColor(txn) }}>
                      {amountText(txn)}
                      {txn.type === 'transfer' && txn.fee_cents > 0 && (
                        <span className="ml-1 text-[11px] font-normal text-slate-400">
                          (手续费 {formatCents(txn.fee_cents)})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-300">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 手机：单列卡片流 */}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm md:hidden">
            {group.rows.map((txn) => (
              <button
                key={txn.id}
                type="button"
                onClick={() => goDetail(txn.id)}
                className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{titleOf(txn)}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    <span className="mr-1.5 font-medium" style={{ color: TXN_META[txn.type].color }}>
                      {TXN_META[txn.type].label}
                    </span>
                    {subLine(txn)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular whitespace-nowrap text-sm font-semibold" style={{ color: amountColor(txn) }}>
                    {amountText(txn)}
                  </p>
                  {txn.type === 'transfer' && txn.fee_cents > 0 && (
                    <p className="tabular mt-0.5 text-[11px] text-slate-400">
                      手续费 {formatCents(txn.fee_cents)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
