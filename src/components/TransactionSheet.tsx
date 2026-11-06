import { useEffect, useState, type FormEvent } from 'react'
import type { TxnType } from '../cloud/database.types'
import { useAccounts } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useCurrentBook } from '../data/books'
import { useCreateTransaction, useUpdateTransaction } from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { toUserMessage } from '../lib/errors'
import { useAppStore, type TransactionDraft } from '../store/useAppStore'
import { Modal } from './Modal'
import {
  accountTypeLabel,
  amountInputClass,
  dangerBtnClass,
  fromLocalInputValue,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  toLocalInputValue,
  TXN_META,
} from './ui'

const TYPE_TABS: ReadonlyArray<{ value: TxnType; label: string; activeClass: string }> = [
  { value: 'expense', label: '支出', activeClass: 'bg-rose-600 text-white' },
  { value: 'income', label: '收入', activeClass: 'bg-emerald-600 text-white' },
  { value: 'transfer', label: '转账', activeClass: 'bg-slate-600 text-white' },
]

/**
 * 全局「记一笔」浮层（design.md §7.5 / §6.3）。
 * 手机端全屏 Sheet、PC 居中 Modal；草稿留在 Zustand，失败不清空、不换 client_token。
 */
export function TransactionSheet() {
  const currentBookId = useCurrentBookId()
  const book = useCurrentBook(currentBookId)

  const open = useAppStore((state) => state.txnSheetOpen)
  const draft = useAppStore((state) => state.txnDraft)
  const editingTxnId = useAppStore((state) => state.editingTxnId)
  const patchDraft = useAppStore((state) => state.patchDraft)
  const setDraftType = useAppStore((state) => state.setDraftType)
  const resetDraft = useAppStore((state) => state.resetDraft)
  const setTxnSheetOpen = useAppStore((state) => state.setTxnSheetOpen)

  const { data: accounts = [] } = useAccounts(currentBookId)
  const { data: categoryOptions = [] } = useCategoryOptions(currentBookId)
  const createTxn = useCreateTransaction()
  const updateTxn = useUpdateTransaction()

  const [formError, setFormError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const isEdit = editingTxnId !== null
  /**
   * 编辑历史流水时，草稿引用的账户可能已经归档；若把它从候选里剔除，
   * select 会丢失选中值并被迫改写账户。因此编辑态额外保留草稿引用的账户。
   */
  const referencedIds = new Set(
    [draft.accountId, draft.counterAccountId].filter((id): id is number => id !== null),
  )
  const accountCandidates = accounts.filter(
    (account) => account.archived_at === null || (isEdit && referencedIds.has(account.id)),
  )
  const accountIds = new Set(accountCandidates.map((account) => account.id))
  const categoryCandidates = categoryOptions.filter((item) => item.kind === draft.type)
  const counterCandidates = accountCandidates.filter((account) => account.id !== draft.accountId)

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 2600)
    return () => window.clearTimeout(timer)
  }, [flash])

  // 打开时清掉不属于当前账本的残留引用，并给一个同类默认分类。
  useEffect(() => {
    if (!open || currentBookId === null) return
    const patch: Partial<TransactionDraft> = {}
    if (draft.accountId !== null && !accountIds.has(draft.accountId)) {
      patch.accountId = null
      patch.counterAccountId = null
    }
    if (draft.counterAccountId !== null && !accountIds.has(draft.counterAccountId)) {
      patch.counterAccountId = null
    }
    const categoryIds = new Set(categoryOptions.map((item) => item.id))
    if (draft.categoryId !== null && !categoryIds.has(draft.categoryId)) {
      patch.categoryId = null
    }
    // 编辑态不自动补默认分类：一条原本「未分类」的转账不该被悄悄改写成有分类。
    // 切换 type 是用户主动操作，changeType() 里仍会按新 kind 取默认值。
    if (!isEdit && draft.categoryId === null && patch.categoryId === undefined) {
      const first = categoryOptions.find((item) => item.kind === draft.type)
      if (first) patch.categoryId = first.id
    }
    if (Object.keys(patch).length > 0) patchDraft(patch)
    // 只在打开 / 切换账本 / 数据源变化时校正一次，不跟随每次草稿输入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentBookId, accountCandidates.length, categoryOptions.length])

  function changeType(type: TxnType) {
    // setDraftType 会清掉对手账户与手续费；分类则按新 kind 重新取默认值。
    setDraftType(type)
    const first = categoryOptions.find((item) => item.kind === type)
    patchDraft({ categoryId: first?.id ?? null })
    setFormError(null)
  }

  function parseId(value: string): number | null {
    if (value === '') return null
    const id = Number(value)
    return Number.isSafeInteger(id) && id > 0 ? id : null
  }

  function onMainAccountChange(value: string) {
    const accountId = parseId(value)
    patchDraft({
      accountId,
      // 转出/转入互斥：新主账户若与已选对手账户相同，立刻清掉对手账户。
      counterAccountId: draft.counterAccountId === accountId ? null : draft.counterAccountId,
    })
    setFormError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (currentBookId === null) {
      setFormError('请先选择账本')
      return
    }
    setFormError(null)
    try {
      const currency = book?.base_currency ?? 'CNY'
      if (isEdit) {
        await updateTxn.mutateAsync({
          bookId: currentBookId,
          txnId: editingTxnId,
          currency,
          draft,
        })
        resetDraft()
        setFlash('已保存修改，余额与报表已刷新')
        return
      }
      const result = await createTxn.mutateAsync({
        bookId: currentBookId,
        currency,
        draft,
      })
      // 成功后才重置草稿：失败时保留全部输入与同一个 client_token，重试是幂等的。
      resetDraft()
      setFlash(result.duplicate ? '这笔记录此前已保存（幂等），未重复记账' : '已保存，余额与报表已刷新')
    } catch (error) {
      setFormError(toUserMessage(error))
    }
  }

  function close() {
    setTxnSheetOpen(false)
    setFormError(null)
  }

  const busy = createTxn.isPending || updateTxn.isPending

  return (
    <>
      <Modal
        open={open}
        wide
        title={isEdit ? '编辑流水' : '记一笔'}
        onClose={close}
        footer={
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className={dangerBtnClass}
              disabled={busy}
              onClick={() => { resetDraft(); setFormError(null) }}
            >
              {isEdit ? '放弃修改' : '清空草稿'}
            </button>
            <div className="flex gap-2">
              <button type="button" className={ghostBtnClass} disabled={busy} onClick={close}>
                取消
              </button>
              <button type="submit" form="txn-form" className={primaryBtnClass} disabled={busy}>
                {busy ? '保存中…' : isEdit ? '保存修改' : '保存流水'}
              </button>
            </div>
          </div>
        }
      >
        <form id="txn-form" onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {isEdit ? '修改账本' : '写入账本'}：
            <span className="font-medium text-slate-700">{book?.name ?? '未选择'}</span>
            {book ? ` · ${book.base_currency}` : ''}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="流水类型">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={draft.type === tab.value}
                onClick={() => changeType(tab.value)}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  draft.type === tab.value ? tab.activeClass : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="txn-amount" className={labelClass}>
              金额（元）· {TXN_META[draft.type].label}
            </label>
            <input
              id="txn-amount"
              className={amountInputClass}
              inputMode="decimal"
              placeholder="0.00"
              value={draft.amount}
              onChange={(event) => { patchDraft({ amount: event.target.value }); setFormError(null) }}
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-400">按「分」以整数存储，最多两位小数，不支持负数。</p>
          </div>

          {draft.type === 'transfer' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="txn-from" className={labelClass}>转出账户</label>
                <select
                  id="txn-from"
                  className={inputClass}
                  value={draft.accountId ?? ''}
                  onChange={(event) => onMainAccountChange(event.target.value)}
                >
                  <option value="">请选择账户</option>
                  {accountCandidates.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="txn-to" className={labelClass}>转入账户</label>
                <select
                  id="txn-to"
                  className={inputClass}
                  value={draft.counterAccountId ?? ''}
                  onChange={(event) => {
                    patchDraft({ counterAccountId: parseId(event.target.value) })
                    setFormError(null)
                  }}
                >
                  <option value="">请选择账户</option>
                  {counterCandidates.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="txn-account" className={labelClass}>
                {draft.type === 'expense' ? '付款账户' : '收款账户'}
              </label>
              <select
                id="txn-account"
                className={inputClass}
                value={draft.accountId ?? ''}
                onChange={(event) => onMainAccountChange(event.target.value)}
              >
                <option value="">请选择账户</option>
                {accountCandidates.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {accountTypeLabel(account.type)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {draft.type === 'transfer' && (
            <div>
              <label htmlFor="txn-fee" className={labelClass}>手续费（可选，从转出方额外扣除）</label>
              <input
                id="txn-fee"
                className={`${inputClass} tabular`}
                inputMode="decimal"
                placeholder="0.00"
                value={draft.fee}
                onChange={(event) => patchDraft({ fee: event.target.value })}
              />
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="txn-category" className={labelClass}>
                分类{draft.type === 'transfer' ? '（可选）' : ''}
              </label>
              <select
                id="txn-category"
                className={inputClass}
                value={draft.categoryId ?? ''}
                onChange={(event) => patchDraft({ categoryId: parseId(event.target.value) })}
              >
                {draft.type === 'transfer' && <option value="">不选择分类</option>}
                {categoryCandidates.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="txn-date" className={labelClass}>发生时间</label>
              <input
                id="txn-date"
                type="datetime-local"
                className={inputClass}
                value={toLocalInputValue(draft.occurredAt)}
                onChange={(event) => patchDraft({ occurredAt: fromLocalInputValue(event.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="txn-note" className={labelClass}>备注（可选）</label>
              <input
                id="txn-note"
                className={inputClass}
                placeholder="例如：午餐"
                maxLength={120}
                value={draft.note}
                onChange={(event) => patchDraft({ note: event.target.value })}
              />
            </div>
            <div>
              <label htmlFor="txn-tags" className={labelClass}>标签（逗号分隔，可选）</label>
              <input
                id="txn-tags"
                className={inputClass}
                placeholder="例如：餐饮,报销"
                maxLength={120}
                value={draft.tags}
                onChange={(event) => patchDraft({ tags: event.target.value })}
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          )}
          <p className="text-xs leading-relaxed text-slate-400">
            支出/收入只关联 1 个账户；转账关联 2 个不同账户且只列当前账本的账户。
            {isEdit
              ? '编辑只更新金额、账户、分类与时间，不会改动归属账本或幂等令牌；保存后余额与报表立即重算。'
              : '重复点击命中幂等索引时会回查并按「已保存」处理，不会产生两笔。'}
          </p>
        </form>
      </Modal>

      {flash && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-lg md:bottom-8">
          {flash}
        </div>
      )}
    </>
  )
}
