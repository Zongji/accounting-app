/**
 * 金额与流水方向的纯逻辑层（design.md §5.1 / §5.2 / §5.3）。
 *
 * 全链路整数「分」，永不参与浮点运算；方向由 type 决定，amount_cents 恒为正。
 * 这里的实现与 sql/002_functions.sql 的 CASE 分支严格对齐，便于单元测试对照。
 */

import type { TxnType } from '../cloud/database.types'

export type { TxnType }

export interface TxnShape {
  type: TxnType
  /** 主账户：支出=付款方，收入=收款方，转账=转出方 */
  account_id: number
  /** 仅转账有值，表示转入方 */
  counter_account_id: number | null
  amount_cents: number
  /** 仅转账可用，从转出方额外扣除 */
  fee_cents: number
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

const AMOUNT_PATTERN = /^(?:\d+|\d*\.\d{1,2})$/

/**
 * 把用户输入的金额字符串解析成整数分。
 * 接受 "1234.56" / "¥ 1,234.5" / 0.01 等；拒绝负数、超 2 位小数、空值、
 * 非数字字符与超出安全整数范围的值（宁可报错也不静默截断精度）。
 */
export function parseCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyError('金额不是有效数字')
    if (input < 0) throw new MoneyError('金额不能为负数，方向由流水类型决定')
  }

  const raw = String(input)
    .trim()
    .replace(/[¥￥,\s，]/g, '')

  if (raw === '' || raw === '.') throw new MoneyError('请输入金额')
  if (!AMOUNT_PATTERN.test(raw)) {
    throw new MoneyError('金额最多保留两位小数，且不能为负数')
  }

  const [integerPart = '0', fractionPart = ''] = raw.split('.')
  const yuan = integerPart === '' ? 0 : Number(integerPart)
  const fen = Number(fractionPart.padEnd(2, '0'))

  if (!Number.isSafeInteger(yuan)) throw new MoneyError('金额超出可处理范围')
  const cents = yuan * 100 + fen
  if (!Number.isSafeInteger(cents)) throw new MoneyError('金额超出可处理范围')
  return cents
}

/** 只用于流水金额：必须 > 0（对应 amount_cents CHECK 约束）。 */
export function parsePositiveCents(input: string | number): number {
  const cents = parseCents(input)
  if (cents <= 0) throw new MoneyError('金额必须大于 0')
  return cents
}

/**
 * 账户期初余额专用：允许负数（信用卡欠款、负债账户），但仍走整数分解析，
 * 不接受三位以上小数或科学计数法。同时避免返回 -0。
 */
export function parseSignedCents(input: string | number): number {
  const raw = String(input).trim().replace(/[¥￥,\s，]/g, '')
  const negative = raw.startsWith('-')
  const body = negative ? raw.slice(1) : raw
  const cents = parseCents(body)
  return negative && cents !== 0 ? -cents : cents
}

/** 整数分 → 展示字符串，默认 "¥ 1,234.56"，负数显示 "-¥ 1,234.56"。 */
export function formatCents(cents: number, options: { withSymbol?: boolean } = {}): string {
  const { withSymbol = true } = options
  if (!Number.isFinite(cents)) throw new MoneyError('金额不是有效数字')

  const negative = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const yuan = Math.floor(abs / 100)
  const fen = abs % 100
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const body = `${grouped}.${String(fen).padStart(2, '0')}`
  return `${negative ? '-' : ''}${withSymbol ? '¥ ' : ''}${body}`
}

/**
 * 一条流水对指定账户的余额增量（单位：分）。
 *
 * 与 account_balance / book_balance_snapshot 的 SQL 口径一一对应：
 *   收入(主账户) +amount；支出(主账户) -amount；
 *   转账(转出方) -(amount + fee)；转账(转入方) +amount；其它 0。
 */
export function deltaCentsForAccount(txn: TxnShape, accountId: number): number {
  const isMain = txn.account_id === accountId
  const isCounter = txn.counter_account_id === accountId

  switch (txn.type) {
    case 'income':
      return isMain ? txn.amount_cents : 0
    case 'expense':
      return isMain ? -txn.amount_cents : 0
    case 'transfer':
      // 同一个账户不可能同时是转出与转入（CHECK 约束保证），转出优先。
      if (isMain) return -(txn.amount_cents + txn.fee_cents)
      if (isCounter) return txn.amount_cents
      return 0
  }
}

/** 一条流水对「账本总余额」的增量：转账只损失手续费。 */
export function bookTotalDeltaCents(txn: TxnShape): number {
  switch (txn.type) {
    case 'income':
      return txn.amount_cents
    case 'expense':
      return -txn.amount_cents
    case 'transfer':
      // 避免 -0：无手续费时总余额必须恰好不变（对齐 +0）。
      return txn.fee_cents === 0 ? 0 : -txn.fee_cents
  }
}

/**
 * 前端表单侧的形状校验（体验层，不是安全边界）。
 * 与 §4.2 的 ck_txn_accounts CHECK 约束完全同构，避免非法输入打到数据库。
 */
export function assertTransactionShape(txn: TxnShape): void {
  if (!['expense', 'income', 'transfer'].includes(txn.type)) {
    throw new MoneyError('未知的流水类型')
  }
  if (!Number.isSafeInteger(txn.amount_cents) || txn.amount_cents <= 0) {
    throw new MoneyError('金额必须大于 0')
  }
  if (!Number.isSafeInteger(txn.fee_cents) || txn.fee_cents < 0) {
    throw new MoneyError('手续费不能为负数')
  }
  if (!Number.isSafeInteger(txn.account_id) || txn.account_id <= 0) {
    throw new MoneyError('请选择主账户')
  }

  if (txn.type !== 'transfer') {
    if (txn.counter_account_id !== null) {
      throw new MoneyError('支出/收入流水只能关联 1 个账户')
    }
    if (txn.fee_cents !== 0) {
      throw new MoneyError('只有转账流水可以填写手续费')
    }
    return
  }

  if (txn.counter_account_id === null || txn.counter_account_id <= 0) {
    throw new MoneyError('转账必须选择转入账户')
  }
  if (txn.counter_account_id === txn.account_id) {
    throw new MoneyError('转出账户与转入账户不能相同')
  }
}
