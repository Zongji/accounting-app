import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AccountRow, AccountType } from '../cloud/database.types'
import {
  ACCOUNT_COLORS,
  ACCOUNT_TYPES,
  useAccountBalances,
  useAccountUsage,
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useDeleteAccount,
  useReorderAccount,
  useUpdateAccount,
  type AccountInput,
} from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useBooks, useCurrentBook } from '../data/books'
import { useRecentTransactions } from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { formatCents } from '../lib/money'
import { toUserMessage } from '../lib/errors'
import { useAppStore } from '../store/useAppStore'
import { Modal } from '../components/Modal'
import { RecentTransactions } from '../components/RecentTransactions'
import {
  accountTypeLabel,
  bookTypeLabel,
  cardClass,
  colorChip,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  smallBtnClass,
  smallDangerBtnClass,
  smallPrimaryBtnClass,
} from '../components/ui'

interface AccountFormModalProps {
  open: boolean
  initial: AccountRow | null
  defaultSortOrder: number
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: AccountInput) => void
}

function AccountFormModal({
  open,
  initial,
  defaultSortOrder,
  busy,
  error,
  onClose,
  onSubmit,
}: AccountFormModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cash')
  const [initialBalance, setInitialBalance] = useState('0')
  const [creditLimit, setCreditLimit] = useState('')
  const [includeInTotal, setIncludeInTotal] = useState(true)
  const [color, setColor] = useState<string>(ACCOUNT_COLORS[0])
  const [sortOrder, setSortOrder] = useState(defaultSortOrder)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setType(initial?.type ?? 'cash')
    setInitialBalance(
      initial ? formatCents(initial.initial_balance_cents, { withSymbol: false }) : '0',
    )
    setCreditLimit(
      initial?.credit_limit_cents != null
        ? formatCents(initial.credit_limit_cents, { withSymbol: false })
        : '',
    )
    setIncludeInTotal(initial?.include_in_total ?? true)
    setColor(initial?.color ?? ACCOUNT_COLORS[0])
    setSortOrder(initial?.sort_order ?? defaultSortOrder)
  }, [open, initial, defaultSortOrder])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({
      name: name.trim(),
      type,
      initialBalance,
      includeInTotal,
      creditLimit,
      color,
      sortOrder,
    })
  }

  return (
    <Modal
      open={open}
      title={initial ? '编辑账户' : '新增账户'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtnClass} onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" form="account-form" className={primaryBtnClass} disabled={busy}>
            {busy ? '保存中…' : initial ? '保存修改' : '创建账户'}
          </button>
        </div>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="account-name" className={labelClass}>账户名称</label>
          <input
            id="account-name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：招行储蓄卡"
            maxLength={40}
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-400">同一账本内未归档账户不能重名；不同账本可以同名。</p>
        </div>
        <div>
          <label htmlFor="account-type" className={labelClass}>账户类型</label>
          <select
            id="account-type"
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="initial-balance" className={labelClass}>期初余额（元）</label>
            <input
              id="initial-balance"
              className={`${inputClass} tabular`}
              inputMode="decimal"
              value={initialBalance}
              onChange={(event) => setInitialBalance(event.target.value)}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-slate-400">允许负数，例如信用卡欠款填 -1200.00。</p>
          </div>
          <div>
            <label htmlFor="credit-limit" className={labelClass}>信用额度（可选）</label>
            <input
              id="credit-limit"
              className={`${inputClass} tabular`}
              inputMode="decimal"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
              placeholder="留空表示不设额度"
            />
          </div>
        </div>
        <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-indigo-600"
            checked={includeInTotal}
            onChange={(event) => setIncludeInTotal(event.target.checked)}
          />
          计入账本总资产
        </label>
        <div>
          <span className={labelClass}>标识颜色</span>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`选择颜色 ${item}`}
                aria-pressed={color === item}
                onClick={() => setColor(item)}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  color === item ? 'scale-110 border-slate-800' : 'border-white'
                }`}
                style={{ backgroundColor: item }}
              />
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </form>
    </Modal>
  )
}

export function BookSettingsPage() {
  const bookId = useCurrentBookId()
  const book = useCurrentBook(bookId)
  const { isLoading: booksLoading } = useBooks()
  const openCreate = useAppStore((state) => state.openCreate)

  const { data: accounts = [], isLoading } = useAccounts(bookId)
  const { data: balances = [] } = useAccountBalances(bookId)
  const { data: usage = new Set<number>() } = useAccountUsage(bookId)
  const { data: categories = [] } = useCategoryOptions(bookId)
  const { data: recent = [] } = useRecentTransactions(bookId, 5)

  const createAccount = useCreateAccount(bookId)
  const updateAccount = useUpdateAccount(bookId)
  const archiveAccount = useArchiveAccount()
  const deleteAccount = useDeleteAccount()
  const reorderAccount = useReorderAccount()

  const [editing, setEditing] = useState<AccountRow | 'new' | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeAccounts = accounts.filter((account) => account.archived_at === null)
  const archivedAccounts = accounts.filter((account) => account.archived_at !== null)
  const busy = createAccount.isPending || updateAccount.isPending
  const nextSortOrder =
    activeAccounts.length > 0
      ? Math.max(...activeAccounts.map((account) => account.sort_order)) + 10
      : 10

  async function run(task: () => Promise<unknown>, successMessage?: string): Promise<boolean> {
    setPageError(null)
    setNotice(null)
    try {
      await task()
      if (successMessage) setNotice(successMessage)
      return true
    } catch (error) {
      setPageError(toUserMessage(error))
      return false
    }
  }

  async function submitAccount(input: AccountInput) {
    if (editing === 'new') {
      const ok = await run(() => createAccount.mutateAsync(input), '账户已创建')
      if (ok) setEditing(null)
      return
    }
    if (editing) {
      const ok = await run(
        () => updateAccount.mutateAsync({ id: editing.id, input }),
        '账户已更新',
      )
      if (ok) setEditing(null)
    }
  }

  function moveAccount(account: AccountRow, direction: -1 | 1) {
    const index = activeAccounts.findIndex((item) => item.id === account.id)
    const neighbor = activeAccounts[index + direction]
    if (!neighbor) return
    const sortOrder = direction === -1 ? neighbor.sort_order - 1 : neighbor.sort_order + 1
    void run(() => reorderAccount.mutateAsync({ id: account.id, sortOrder }), '顺序已更新')
  }

  function removeAccount(account: AccountRow) {
    const confirmed = window.confirm(
      `删除账户「${account.name}」？\n\n该账户没有任何流水。删除后不可恢复；若以后会产生流水，建议改用归档。`,
    )
    if (!confirmed) return
    void run(() => deleteAccount.mutateAsync(account.id), '账户已删除')
  }

  function toggleArchive(account: AccountRow, archived: boolean) {
    void run(
      () => archiveAccount.mutateAsync({ id: account.id, archived }),
      archived ? '账户已归档' : '账户已恢复',
    )
  }

  if (booksLoading) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-slate-400">正在加载账本…</p>
      </div>
    )
  }

  if (bookId === null || !book) {
    return (
      <div className={cardClass}>
        <h1 className="text-lg font-semibold text-slate-800">账本设置</h1>
        <p className="mt-2 text-sm text-slate-500">
          请先从账本列表进入一个未归档的账本。账户配置始终隶属于具体账本。
        </p>
        <Link to="/books" className={`${primaryBtnClass} mt-4 inline-block`}>
          前往账本列表
        </Link>
      </div>
    )
  }

  const balanceOf = (accountId: number) =>
    balances.find((item) => item.account_id === accountId)?.balance_cents ?? null
  const totalCents = balances
    .filter((item) => item.include_in_total)
    .reduce((sum, item) => sum + item.balance_cents, 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">账本设置</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{book.name}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {bookTypeLabel(book.type)} · 本位币 {book.base_currency} · 账户与流水仅属于本账本
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={ghostBtnClass} onClick={openCreate}>
            记一笔
          </button>
          <button type="button" className={primaryBtnClass} onClick={() => setEditing('new')}>
            + 新增账户
          </button>
        </div>
      </header>

      {pageError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {pageError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">账本总资产（计入总资产的账户）</p>
            <p className="tabular mt-1 text-2xl font-semibold text-slate-900">{formatCents(totalCents)}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
            {activeAccounts.length} 个在用账户
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          余额由 book_balance_snapshot 实时聚合，前端不做累加；转账只减少手续费。
        </p>
      </section>

      <section className={cardClass}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">账户配置</h2>
          <span className="text-xs text-slate-400">按账本独立维护，可排序、归档</span>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">正在加载账户…</p>
        ) : activeAccounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">还没有账户，点「新增账户」开始配置。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activeAccounts.map((account, index) => {
              const balance = balanceOf(account.id)
              const hasTransactions = usage.has(account.id)
              return (
                <li key={account.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorChip(account.color) }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{account.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {accountTypeLabel(account.type)}
                          {' · 期初 '}
                          <span className="tabular">{formatCents(account.initial_balance_cents)}</span>
                          {!account.include_in_total && ' · 不计入总资产'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-sm font-semibold text-slate-800">
                        {balance === null ? '—' : formatCents(balance)}
                      </p>
                      <p className="text-[11px] text-slate-400">当前余额</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-4">
                    <Link
                      to={`/book/${bookId}/accounts/${account.id}`}
                      className={smallPrimaryBtnClass}
                    >
                      详情
                    </Link>
                    <button type="button" className={smallBtnClass} onClick={() => setEditing(account)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      aria-label="上移"
                      disabled={index === 0 || reorderAccount.isPending}
                      onClick={() => moveAccount(account, -1)}
                      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      disabled={index === activeAccounts.length - 1 || reorderAccount.isPending}
                      onClick={() => moveAccount(account, 1)}
                      className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={archiveAccount.isPending}
                      onClick={() => toggleArchive(account, true)}
                      className={smallBtnClass}
                    >
                      归档
                    </button>
                    <button
                      type="button"
                      disabled={hasTransactions || deleteAccount.isPending}
                      title={hasTransactions ? '该账户已有流水，按 §5.6 只能归档' : '删除无流水的账户'}
                      onClick={() => removeAccount(account)}
                      className={smallDangerBtnClass}
                    >
                      {hasTransactions ? '有流水·不可删' : '删除'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {archivedAccounts.length > 0 && (
          <details className="mt-3 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-500">
              已归档账户（{archivedAccounts.length}）
            </summary>
            <ul className="mt-2 divide-y divide-slate-100">
              {archivedAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm text-slate-500">{account.name}</span>
                  <button
                    type="button"
                    disabled={archiveAccount.isPending}
                    onClick={() => toggleArchive(account, false)}
                    className={smallBtnClass}
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={cardClass}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">最近流水</h2>
            <p className="mt-0.5 text-xs text-slate-400">本账本最新的 5 条记录（只读）</p>
          </div>
          <button type="button" className={smallPrimaryBtnClass} onClick={openCreate}>
            记一笔
          </button>
        </div>
        <RecentTransactions transactions={recent} accounts={accounts} categories={categories} />
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        分类当前只读引用内置模板（{categories.length} 项）；自定义分类属于 P1。
        有流水的账户按 §5.6 只能归档，避免历史余额断裂。
      </p>

      <AccountFormModal
        open={editing !== null}
        initial={editing === 'new' || editing === null ? null : editing}
        defaultSortOrder={nextSortOrder}
        busy={busy}
        error={pageError}
        onClose={() => { setEditing(null); setPageError(null) }}
        onSubmit={(input) => void submitAccount(input)}
      />
    </div>
  )
}
