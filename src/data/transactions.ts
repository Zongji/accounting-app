import { useMutation, useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import type { TransactionRow } from '../cloud/database.types'
import { assertAffected, isDuplicateError, toUserMessage, unwrapRows } from '../lib/errors'
import {
  buildTransactionInsert,
  buildTransactionUpdate,
} from '../lib/transaction'
import { invalidateBookQueries, queryKeys } from '../lib/queryClient'
import type { TransactionDraft } from '../store/useAppStore'

/**
 * 流水数据访问层（design.md §5.1 / §5.2 / §6.3）。
 *
 * - 金额在提交前解析成整数分，并用 assertTransactionShape 与 ck_txn_accounts 同构预检；
 * - client_token 随行插入，重复提交命中 23505 时按「已保存」处理并回查；
 * - 网络失败不重置草稿、不换 token，重试天然幂等。
 */

export function useRecentTransactions(bookId: number | null, limit = 5) {
  return useQuery({
    queryKey: queryKeys.recentTransactions(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<TransactionRow[]> => {
      if (bookId === null) return []
      return unwrapRows(
        await cloud.database
          .from('transactions')
          .select('*')
          .eq('book_id', bookId)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false })
          .limit(limit),
      )
    },
  })
}

export interface CreateTransactionArgs {
  bookId: number
  currency: string
  draft: TransactionDraft
}

export interface CreateTransactionResult {
  id: number
  /** true = 命中幂等索引，回查到既有记录 */
  duplicate: boolean
}

export async function createTransaction({
  bookId,
  currency,
  draft,
}: CreateTransactionArgs): Promise<CreateTransactionResult> {
  const payload = buildTransactionInsert({ bookId, currency, draft })

  const result = await cloud.database.from('transactions').insert(payload).select('id')
  if (result.error) {
    if (isDuplicateError(result.error)) {
      const existing = await cloud.database
        .from('transactions')
        .select('id')
        .eq('client_token', payload.client_token)
        .maybeSingle()
      if (existing.error) {
        throw new Error(toUserMessage(existing.error), { cause: existing.error })
      }
      if (existing.data) return { id: existing.data.id, duplicate: true }
      throw new Error('重复提交已命中幂等索引，但回查未找到记录，请在明细中确认')
    }
    throw new Error(toUserMessage(result.error), { cause: result.error })
  }

  // 写操作 .select() 返回空数组通常是被 RLS 拦下，不能当成成功（§4.5）。
  const rows = assertAffected(result)
  const id = rows[0]?.id
  if (!id) throw new Error('流水保存失败，请重试')
  return { id, duplicate: false }
}

export function useCreateTransaction() {
  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => invalidateBookQueries(),
  })
}

/** 明细页全量流水：一次取回该账本未删除的流水，前端再做筛选与按天分组。 */
export function useTransactions(bookId: number | null) {
  return useQuery({
    queryKey: queryKeys.transactionsAll(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<TransactionRow[]> => {
      if (bookId === null) return []
      return unwrapRows(
        await cloud.database
          .from('transactions')
          .select('*')
          .eq('book_id', bookId)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false })
          .limit(1000),
      )
    },
  })
}

/** 单条详情：带 book_id 约束，跨账本或已软删除的记录查不到。 */
export function useTransaction(bookId: number | null, txnId: number | null) {
  return useQuery({
    queryKey: queryKeys.transaction(bookId, txnId),
    enabled: bookId !== null && txnId !== null,
    queryFn: async (): Promise<TransactionRow | null> => {
      if (bookId === null || txnId === null) return null
      const { data, error } = await cloud.database
        .from('transactions')
        .select('*')
        .eq('id', txnId)
        .eq('book_id', bookId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw new Error(toUserMessage(error), { cause: error })
      return (data as TransactionRow | null) ?? null
    },
  })
}

export interface UpdateTransactionArgs {
  bookId: number
  txnId: number
  currency: string
  draft: TransactionDraft
}

/**
 * 编辑流水（§5.6 / §6.3）：
 * - 载荷不含 owner_id / book_id / client_token，编辑不改归属、不换幂等令牌；
 * - WHERE 同时限定 id 与 book_id，避免把别账本的流水改掉；
 * - assertAffected 防止 RLS 静默拦截被当成成功；
 * - 成功后失效账本维度缓存，余额/报表/明细立即重算。
 */
export async function updateTransaction({
  bookId,
  txnId,
  currency,
  draft,
}: UpdateTransactionArgs): Promise<void> {
  const payload = buildTransactionUpdate({ currency, draft })
  assertAffected(
    await cloud.database
      .from('transactions')
      .update(payload)
      .eq('id', txnId)
      .eq('book_id', bookId)
      .is('deleted_at', null)
      .select('id'),
  )
}

export function useUpdateTransaction() {
  return useMutation({
    mutationFn: updateTransaction,
    onSuccess: () => invalidateBookQueries(),
  })
}

/** 软删除：只置 deleted_at，所有查询与余额/报表函数都过滤它（§5.6）。 */
export async function softDeleteTransaction({
  bookId,
  txnId,
}: {
  bookId: number
  txnId: number
}): Promise<void> {
  const now = new Date().toISOString()
  assertAffected(
    await cloud.database
      .from('transactions')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', txnId)
      .eq('book_id', bookId)
      .is('deleted_at', null)
      .select('id'),
  )
}

export function useSoftDeleteTransaction() {
  return useMutation({
    mutationFn: softDeleteTransaction,
    onSuccess: () => invalidateBookQueries(),
  })
}
