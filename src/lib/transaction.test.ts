import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../cloud/database.types'
import {
  buildTransactionInsert,
  buildTransactionUpdate,
  draftFromTransaction,
  type TransactionDraftLike,
} from './transaction'

const baseDraft: TransactionDraftLike = {
  type: 'expense',
  amount: '12.34',
  accountId: 1,
  counterAccountId: null,
  categoryId: 10,
  fee: '',
  note: '',
  tags: '',
  clientToken: 'token-fixed-1',
  occurredAt: '2026-11-06T10:30:00.000Z',
}

function build(patch: Partial<TransactionDraftLike> = {}) {
  return buildTransactionInsert({
    bookId: 3,
    currency: 'CNY',
    draft: { ...baseDraft, ...patch },
  })
}

describe('buildTransactionInsert · 三种流水与账户关联规则', () => {
  it('支出只关联 1 个账户，金额按整数分、对手账户与手续费恒为空', () => {
    expect(build()).toEqual({
      book_id: 3,
      account_id: 1,
      counter_account_id: null,
      category_id: 10,
      type: 'expense',
      amount_cents: 1234,
      fee_cents: 0,
      currency: 'CNY',
      occurred_at: '2026-11-06T10:30:00.000Z',
      note: null,
      tags: [],
      client_token: 'token-fixed-1',
    })
  })

  it('收入只关联 1 个账户，方向由 type 决定而不是负数金额', () => {
    const row = build({ type: 'income', amount: '¥ 1,234.56', note: '  工资  ', tags: '餐饮，报销, 差旅' })
    expect(row.amount_cents).toBe(123456)
    expect(row.counter_account_id).toBeNull()
    expect(row.fee_cents).toBe(0)
    expect(row.note).toBe('工资')
    expect(row.tags).toEqual(['餐饮', '报销', '差旅'])
  })

  it('转账关联 2 个不同账户，手续费从转出方额外扣除', () => {
    const row = build({ type: 'transfer', amount: '100', counterAccountId: 2, fee: '0.50' })
    expect(row.account_id).toBe(1)
    expect(row.counter_account_id).toBe(2)
    expect(row.amount_cents).toBe(10000)
    expect(row.fee_cents).toBe(50)
  })

  it('切换 type 后草稿残留的对手账户与手续费会被丢弃，不触发 CHECK', () => {
    const row = build({ type: 'expense', counterAccountId: 2, fee: '5' })
    expect(row.counter_account_id).toBeNull()
    expect(row.fee_cents).toBe(0)
  })
})

describe('buildTransactionInsert · 边界与拒绝路径', () => {
  it('金额边界：0.01 元通过，0 / 负数 / 三位小数被拒', () => {
    expect(build({ amount: '0.01' }).amount_cents).toBe(1)
    expect(() => build({ amount: '0' })).toThrow('金额必须大于 0')
    expect(() => build({ amount: '-1' })).toThrow('金额')
    expect(() => build({ amount: '1.234' })).toThrow('两位小数')
  })

  it('转账必须两个不同账户，手续费不能为负', () => {
    expect(() => build({ type: 'transfer' })).toThrow('必须选择转入账户')
    expect(() => build({ type: 'transfer', counterAccountId: 1 })).toThrow('不能相同')
    expect(() => build({ type: 'transfer', counterAccountId: 2, fee: '-1' })).toThrow('手续费不能为负数')
  })

  it('支出/收入必填分类与账户；转账可不选分类', () => {
    expect(() => build({ categoryId: null })).toThrow('请选择分类')
    expect(() => build({ accountId: null })).toThrow('请选择账户')
    expect(build({ type: 'transfer', counterAccountId: 2, categoryId: null }).category_id).toBeNull()
  })

  it('日期无效被拒，本地时间字符串归一成 ISO', () => {
    expect(() => build({ occurredAt: 'not-a-date' })).toThrow('日期无效')
    const row = build({ occurredAt: '2026-11-06T18:30' })
    expect(row.occurred_at).toBe(new Date('2026-11-06T18:30').toISOString())
  })

  it('标签过滤空值并最多保留 8 个', () => {
    expect(build({ tags: ' a, ，,b ， c,, ' }).tags).toEqual(['a', 'b', 'c'])
    expect(build({ tags: '1,2,3,4,5,6,7,8,9,10' }).tags).toHaveLength(8)
  })

  it('同一份草稿重复构建得到完全相同的载荷与幂等令牌', () => {
    expect(build()).toEqual(build())
    expect(build().client_token).toBe('token-fixed-1')
  })
})

function sampleRow(patch: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 42,
    owner_id: 'user-1',
    book_id: 3,
    account_id: 1,
    counter_account_id: null,
    category_id: 10,
    type: 'expense',
    amount_cents: 1234,
    fee_cents: 0,
    currency: 'CNY',
    occurred_at: '2026-11-06T10:30:00.000Z',
    note: '  午餐 ',
    tags: ['餐饮', '报销'],
    attachment_urls: [],
    client_token: 'token-fixed-1',
    deleted_at: null,
    created_at: '2026-11-06T10:30:00.000Z',
    updated_at: '2026-11-06T10:30:00.000Z',
    ...patch,
  }
}

describe('draftFromTransaction · 编辑预填', () => {
  it('整数分转元字符串、tags 数组转逗号串、时间保持 ISO', () => {
    const draft = draftFromTransaction(sampleRow())
    expect(draft).toEqual({
      type: 'expense',
      amount: '12.34',
      accountId: 1,
      counterAccountId: null,
      categoryId: 10,
      fee: '',
      note: '  午餐 ',
      tags: '餐饮,报销',
      clientToken: 'token-fixed-1',
      occurredAt: '2026-11-06T10:30:00.000Z',
    })
  })

  it('转账带上对手账户与手续费；空备注/空 client_token 也能反填', () => {
    const draft = draftFromTransaction(
      sampleRow({
        type: 'transfer',
        counter_account_id: 2,
        fee_cents: 50,
        amount_cents: 10000,
        note: null,
        tags: [],
        client_token: null,
      }),
    )
    expect(draft.counterAccountId).toBe(2)
    expect(draft.fee).toBe('0.50')
    expect(draft.amount).toBe('100.00')
    expect(draft.note).toBe('')
    expect(draft.clientToken).toBe('')
  })

  it('行 → 草稿 → 载荷往返：金额、账户、分类、类型完全一致', () => {
    const row = sampleRow()
    const rebuilt = buildTransactionInsert({
      bookId: row.book_id,
      currency: row.currency,
      draft: draftFromTransaction(row),
    })
    expect(rebuilt.amount_cents).toBe(row.amount_cents)
    expect(rebuilt.account_id).toBe(row.account_id)
    expect(rebuilt.category_id).toBe(row.category_id)
    expect(rebuilt.type).toBe(row.type)
    expect(rebuilt.note).toBe('午餐')
    expect(rebuilt.tags).toEqual(row.tags)
  })
})

describe('buildTransactionUpdate · 编辑载荷', () => {
  it('不含 book_id / client_token / owner_id，且带 updated_at', () => {
    const payload = buildTransactionUpdate({
      currency: 'CNY',
      draft: baseDraft,
      updatedAt: '2026-11-06T12:00:00.000Z',
    })
    expect(payload).not.toHaveProperty('book_id')
    expect(payload).not.toHaveProperty('client_token')
    expect(payload).not.toHaveProperty('owner_id')
    expect(payload.updated_at).toBe('2026-11-06T12:00:00.000Z')
    expect(payload.amount_cents).toBe(1234)
  })

  it('编辑时把转账改成支出会丢弃对手账户与手续费，不触发 CHECK', () => {
    const payload = buildTransactionUpdate({
      currency: 'CNY',
      draft: { ...baseDraft, type: 'expense', counterAccountId: 2, fee: '5' },
      updatedAt: '2026-11-06T12:00:00.000Z',
    })
    expect(payload.counter_account_id).toBeNull()
    expect(payload.fee_cents).toBe(0)
  })

  it('非法草稿同样被拒，编辑不会写入脏数据', () => {
    expect(() =>
      buildTransactionUpdate({ currency: 'CNY', draft: { ...baseDraft, amount: '0' } }),
    ).toThrow('金额必须大于 0')
  })
})
