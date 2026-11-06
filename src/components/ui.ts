import dayjs from 'dayjs'
import type { AccountType, BookType, TxnType } from '../cloud/database.types'
import { ACCOUNT_TYPES } from '../data/accounts'
import { BOOK_TYPES } from '../data/books'

/** 表单与按钮的统一样式，避免各页面重复长串 Tailwind 类名。 */
export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50'
export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'
export const primaryBtnClass =
  'rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'
export const ghostBtnClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const dangerBtnClass =
  'rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50'
/** 卡片内密集操作的紧凑尺寸，避免用 !important 覆盖基础按钮类。 */
export const smallBtnClass =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
export const smallPrimaryBtnClass =
  'rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50'
export const smallDangerBtnClass =
  'rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50'
export const amountInputClass =
  'tabular w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-2xl font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50'
export const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'

/** 国内习惯：支出红、收入绿、转账中性色（design.md §7.2）。 */
export const TXN_META: Record<TxnType, { label: string; color: string; sign: string }> = {
  expense: { label: '支出', color: '#dc2626', sign: '-' },
  income: { label: '收入', color: '#16a34a', sign: '+' },
  transfer: { label: '转账', color: '#64748b', sign: '' },
}

export function bookTypeLabel(type: BookType): string {
  return BOOK_TYPES.find((item) => item.value === type)?.label ?? type
}

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPES.find((item) => item.value === type)?.label ?? type
}

export function formatDateTime(iso: string): string {
  return dayjs(iso).format('MM-DD HH:mm')
}

export function formatDate(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD')
}

/** ISO → <input type="datetime-local"> 的本地时间字符串 */
export function toLocalInputValue(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DDTHH:mm')
}

/** datetime-local → ISO（无效输入返回原值，交由提交层校验） */
export function fromLocalInputValue(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function colorChip(color: string | null, fallback = '#6366f1'): string {
  return color || fallback
}
