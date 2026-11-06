import { create } from 'zustand'
import type { TransactionRow } from '../cloud/database.types'
import { invalidateBookQueries } from '../lib/queryClient'
import { draftFromTransaction } from '../lib/transaction'
import type { TxnType } from '../lib/money'

/**
 * Zustand 只存本地 UI 状态（design.md §7.3）：
 * 当前账本、表单草稿、弹层开关、筛选条件。服务端状态一律交给 TanStack Query。
 */

export interface TransactionDraft {
  type: TxnType
  amount: string
  accountId: number | null
  counterAccountId: number | null
  categoryId: number | null
  fee: string
  note: string
  /** 逗号分隔的标签输入，提交时拆成 TEXT[] */
  tags: string
  /** 幂等令牌，弱网重试沿用同一个（design.md §6.3） */
  clientToken: string
  occurredAt: string
}

export interface TransactionFilters {
  keyword: string
  accountId: number | null
  categoryId: number | null
  from: string
  to: string
}

/** 幂等令牌：优先用浏览器原生 UUID，非安全上下文下降级为时间+随机串。 */
export function newClientToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tk-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emptyDraft(): TransactionDraft {
  return {
    type: 'expense',
    amount: '',
    accountId: null,
    counterAccountId: null,
    categoryId: null,
    fee: '',
    note: '',
    tags: '',
    clientToken: newClientToken(),
    occurredAt: new Date().toISOString(),
  }
}

interface AppState {
  currentBookId: number | null
  txnDraft: TransactionDraft
  txnSheetOpen: boolean
  /** 非 null = 正在编辑该流水；null = 新建。共用同一份草稿与同一个浮层。 */
  editingTxnId: number | null
  filters: TransactionFilters

  setCurrentBookId: (bookId: number | null) => void
  patchDraft: (patch: Partial<TransactionDraft>) => void
  /** 切换流水类型时清空对手账户与手续费，避免残留触发 CHECK 约束失败（§7.5） */
  setDraftType: (type: TxnType) => void
  resetDraft: () => void
  setTxnSheetOpen: (open: boolean) => void
  /** 打开新建：清空草稿并生成新的 client_token */
  openCreate: () => void
  /** 打开编辑：用数据库行反填草稿，clientToken 沿用但提交时不参与 update */
  openEdit: (row: TransactionRow) => void
  patchFilters: (patch: Partial<TransactionFilters>) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentBookId: null,
  txnDraft: emptyDraft(),
  txnSheetOpen: false,
  editingTxnId: null,
  filters: { keyword: '', accountId: null, categoryId: null, from: '', to: '' },

  setCurrentBookId: (bookId) => {
    const state = useAppStore.getState()
    if (state.currentBookId === bookId) return
    // 切换账本必须丢掉草稿里属于上一个账本的账户/分类，否则会写出跨账本流水。
    set({
      currentBookId: bookId,
      txnDraft: {
        ...state.txnDraft,
        accountId: null,
        counterAccountId: null,
        categoryId: null,
      },
    })
    invalidateBookQueries()
  },
  patchDraft: (patch) => set((state) => ({ txnDraft: { ...state.txnDraft, ...patch } })),
  setDraftType: (type) =>
    set((state) => ({
      txnDraft: {
        ...state.txnDraft,
        type,
        counterAccountId: null,
        fee: '',
      },
    })),
  resetDraft: () =>
    set({ txnDraft: emptyDraft(), txnSheetOpen: false, editingTxnId: null }),
  setTxnSheetOpen: (open) =>
    set((state) => ({
      txnSheetOpen: open,
      // 关闭浮层就退出编辑态，避免下次打开还停留在上一笔流水。
      editingTxnId: open ? state.editingTxnId : null,
    })),
  openCreate: () =>
    set({ txnSheetOpen: true, editingTxnId: null, txnDraft: emptyDraft() }),
  openEdit: (row) =>
    set({
      txnSheetOpen: true,
      editingTxnId: row.id,
      txnDraft: draftFromTransaction(row),
    }),
  patchFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
}))
