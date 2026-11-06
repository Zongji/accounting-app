import { useMutation, useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import type { AccountBalanceRow, AccountRow, AccountType } from '../cloud/database.types'
import { assertAffected, isDuplicateError, toUserMessage, unwrapRows } from '../lib/errors'
import { parseSignedCents } from '../lib/money'
import { invalidateBookQueries, queryKeys } from '../lib/queryClient'

/**
 * 账户数据访问层（design.md §4.3 / §5.6 / §7.3）。
 * 所有查询都带 book_id = 当前账本，杜绝 A 账本账户出现在 B 账本下拉里。
 */

export const ACCOUNT_TYPES: ReadonlyArray<{ value: AccountType; label: string }> = [
  { value: 'cash', label: '现金' },
  { value: 'debit_card', label: '储蓄卡' },
  { value: 'credit_card', label: '信用卡' },
  { value: 'ewallet', label: '电子钱包' },
  { value: 'investment', label: '投资账户' },
  { value: 'receivable', label: '应收' },
  { value: 'liability', label: '负债' },
]

export const ACCOUNT_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'] as const

export interface AccountInput {
  name: string
  type: AccountType
  /** 期初余额，允许负数（信用卡欠款），提交时按整数分解析 */
  initialBalance: string
  includeInTotal: boolean
  /** 信用卡额度，可留空 */
  creditLimit: string
  color: string | null
  sortOrder: number
}

function toAccountValues(input: AccountInput, bookId: number) {
  const name = input.name.trim()
  if (!name) throw new Error('请输入账户名称')
  const initial = input.initialBalance.trim() === '' ? 0 : parseSignedCents(input.initialBalance)
  const creditLimit =
    input.creditLimit.trim() === '' ? null : parseSignedCents(input.creditLimit)
  if (creditLimit !== null && creditLimit < 0) throw new Error('信用额度不能为负数')

  return {
    book_id: bookId,
    name,
    type: input.type,
    initial_balance_cents: initial,
    currency: 'CNY',
    include_in_total: input.includeInTotal,
    credit_limit_cents: creditLimit,
    color: input.color,
    sort_order: input.sortOrder,
  }
}

/** 返回该账本的全部账户（含已归档），UI 自行分组展示。 */
export function useAccounts(bookId: number | null) {
  return useQuery({
    queryKey: queryKeys.accounts(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<AccountRow[]> => {
      if (bookId === null) return []
      const rows = unwrapRows(
        await cloud.database
          .from('accounts')
          .select('*')
          .eq('book_id', bookId)
          .order('sort_order'),
      )
      return rows.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    },
  })
}

/** 余额一律取 RPC，前端不做金额累加（§7.3）。 */
export function useAccountBalances(bookId: number | null) {
  return useQuery({
    queryKey: queryKeys.balanceSnapshot(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<AccountBalanceRow[]> => {
      if (bookId === null) return []
      return unwrapRows(
        await cloud.database.rpc('book_balance_snapshot', { p_book_id: bookId }),
      )
    },
  })
}

/**
 * 被任意流水（含软删除、含转账对手账户）引用过的账户 ID 集合。
 * 用于判断能否物理删除：有流水的账户只能归档，否则历史余额会断裂。
 */
export function useAccountUsage(bookId: number | null) {
  return useQuery({
    queryKey: queryKeys.accountUsage(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<Set<number>> => {
      const ids = new Set<number>()
      if (bookId === null) return ids
      const rows = unwrapRows(
        await cloud.database
          .from('transactions')
          .select('account_id,counter_account_id')
          .eq('book_id', bookId)
          .limit(1000),
      )
      for (const row of rows) {
        ids.add(row.account_id)
        if (row.counter_account_id !== null) ids.add(row.counter_account_id)
      }
      return ids
    },
  })
}

/** 账户名重名由 uq_accounts_name_active 挡住，转成贴合场景的提示。 */
function throwAccountWriteError(error: unknown): never {
  if (isDuplicateError(error)) {
    throw new Error('同一账本下已有同名账户，请换一个名称')
  }
  throw new Error(toUserMessage(error), { cause: error })
}

export function useCreateAccount(bookId: number | null) {
  return useMutation({
    mutationFn: async (input: AccountInput): Promise<number> => {
      if (bookId === null) throw new Error('请先选择账本')
      const result = await cloud.database
        .from('accounts')
        .insert(toAccountValues(input, bookId))
        .select('id')
      if (result.error) throwAccountWriteError(result.error)
      const rows = assertAffected(result)
      const id = rows[0]?.id
      if (!id) throw new Error('账户创建失败，请重试')
      return id
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

export function useUpdateAccount(bookId: number | null) {
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: number
      input: AccountInput
    }): Promise<void> => {
      if (bookId === null) throw new Error('请先选择账本')
      // 不含 book_id：账户不能跨账本搬家，也避免触发器/唯一索引意外改写归属。
      const { book_id: _bookId, ...values } = toAccountValues(input, bookId)
      void _bookId
      const result = await cloud.database
        .from('accounts')
        .update(values)
        .eq('id', id)
        .eq('book_id', bookId)
        .select('id')
      if (result.error) throwAccountWriteError(result.error)
      assertAffected(result)
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

export function useArchiveAccount() {
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }): Promise<void> => {
      assertAffected(
        await cloud.database
          .from('accounts')
          .update({ archived_at: archived ? new Date().toISOString() : null })
          .eq('id', id)
          .select('id'),
      )
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

/** 删除前二次校验流水引用；即使 UI 判断过期，数据库外键仍会兜住。 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (accountId: number): Promise<void> => {
      const [asMain, asCounter] = await Promise.all([
        cloud.database.from('transactions').select('id').eq('account_id', accountId).limit(1),
        cloud.database
          .from('transactions')
          .select('id')
          .eq('counter_account_id', accountId)
          .limit(1),
      ])
      const mainError = asMain.error ?? asCounter.error
      if (mainError) throw new Error(toUserMessage(mainError), { cause: mainError })
      if ((asMain.data?.length ?? 0) > 0 || (asCounter.data?.length ?? 0) > 0) {
        throw new Error('该账户已有流水，禁止删除；请改用归档以保留历史余额')
      }
      assertAffected(
        await cloud.database.from('accounts').delete().eq('id', accountId).select('id'),
      )
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

/** 与账本排序同样的单点更新策略。 */
export function useReorderAccount() {
  return useMutation({
    mutationFn: async ({ id, sortOrder }: { id: number; sortOrder: number }): Promise<void> => {
      assertAffected(
        await cloud.database
          .from('accounts')
          .update({ sort_order: sortOrder })
          .eq('id', id)
          .select('id'),
      )
    },
    onSuccess: () => invalidateBookQueries(),
  })
}
