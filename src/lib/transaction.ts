import type { TransactionRow, TxnType } from '../cloud/database.types'
import { assertTransactionShape, formatCents, parsePositiveCents, parseSignedCents } from './money'

/**
 * 「记一笔」表单 → 数据库插入载荷的纯逻辑层（design.md §5.1 / §5.2 / §7.5 / §6.3）。
 * 不依赖 SDK，便于用 Vitest 覆盖三种类型、账户互斥、整数分与幂等令牌。
 */

export interface TransactionDraftLike {
  type: TxnType
  amount: string
  accountId: number | null
  counterAccountId: number | null
  categoryId: number | null
  fee: string
  note: string
  tags: string
  clientToken: string
  occurredAt: string
}

/** 与 transactions 表 Insert 对齐；绝不出现 owner_id（由 DEFAULT auth.uid() 填充）。 */
export interface TransactionInsert {
  book_id: number
  account_id: number
  counter_account_id: number | null
  category_id: number | null
  type: TxnType
  amount_cents: number
  fee_cents: number
  currency: string
  occurred_at: string
  note: string | null
  tags: string[]
  client_token: string
}

function parseTags(input: string): string[] {
  return input
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8)
}

/**
 * 新建与编辑共用的可变字段：不含 book_id / owner_id / client_token。
 * 普通收支会强制 counter_account_id = null / fee_cents = 0，
 * 即使草稿里还残留着上一次转账的输入，也不会触发 ck_txn_accounts。
 * book_id 不参与编辑：账户专属账本，编辑时不允许把流水搬到别的账本（§5.7）。
 * client_token 不参与编辑：幂等令牌是创建时生成的，编辑不该改它（§6.3）。
 */
export type MutableTransactionFields = Omit<
  TransactionInsert,
  'book_id' | 'client_token'
>

export function buildMutableTransactionFields({
  currency,
  draft,
}: {
  currency: string
  draft: TransactionDraftLike
}): MutableTransactionFields {
  const amount_cents = parsePositiveCents(draft.amount)
  const fee_cents =
    draft.type === 'transfer'
      ? parseSignedCents(draft.fee.trim() === '' ? '0' : draft.fee)
      : 0
  if (fee_cents < 0) throw new Error('手续费不能为负数')

  const account_id = draft.accountId
  // type 决定关联账户数：非转账一律丢弃对手账户，避免残留值打到 CHECK 约束。
  const counter_account_id = draft.type === 'transfer' ? draft.counterAccountId : null
  const category_id = draft.categoryId

  if (account_id === null) throw new Error('请选择账户')
  if (draft.type !== 'transfer' && category_id === null) throw new Error('请选择分类')
  if (!Number.isFinite(Date.parse(draft.occurredAt))) throw new Error('日期无效，请重新选择')

  // 体验层校验；真正的边界仍是数据库 CHECK 与 trg_txn_accounts 触发器。
  assertTransactionShape({
    type: draft.type,
    account_id,
    counter_account_id,
    amount_cents,
    fee_cents,
  })

  return {
    account_id,
    counter_account_id,
    category_id,
    type: draft.type,
    amount_cents,
    fee_cents,
    currency,
    occurred_at: new Date(draft.occurredAt).toISOString(),
    note: draft.note.trim() === '' ? null : draft.note.trim(),
    tags: parseTags(draft.tags),
  }
}

export function buildTransactionInsert({
  bookId,
  currency,
  draft,
}: {
  bookId: number
  currency: string
  draft: TransactionDraftLike
}): TransactionInsert {
  return {
    ...buildMutableTransactionFields({ currency, draft }),
    book_id: bookId,
    client_token: draft.clientToken,
  }
}

/**
 * 编辑流水的 update 载荷：只有可变字段 + updated_at。
 * 绝不出现 book_id / owner_id / client_token / created_at，避免改归属或动幂等令牌。
 */
export function buildTransactionUpdate({
  currency,
  draft,
  updatedAt,
}: {
  currency: string
  draft: TransactionDraftLike
  updatedAt?: string
}): MutableTransactionFields & { updated_at: string } {
  return {
    ...buildMutableTransactionFields({ currency, draft }),
    updated_at: updatedAt ?? new Date().toISOString(),
  }
}

/**
 * 数据库行 → 表单草稿（编辑预填）。整数分转回元字符串、tags 数组转逗号串，
 * occurred_at 保持 ISO；clientToken 沿用原值但编辑提交不会用到它。
 */
export function draftFromTransaction(row: TransactionRow): TransactionDraftLike {
  return {
    type: row.type,
    amount: formatCents(row.amount_cents, { withSymbol: false }),
    accountId: row.account_id,
    counterAccountId: row.counter_account_id,
    categoryId: row.category_id,
    fee: row.fee_cents > 0 ? formatCents(row.fee_cents, { withSymbol: false }) : '',
    note: row.note ?? '',
    tags: row.tags.join(','),
    clientToken: row.client_token ?? '',
    occurredAt: row.occurred_at,
  }
}
