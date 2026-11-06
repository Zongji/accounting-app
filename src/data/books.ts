import { useMutation, useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import type { BookRow, BookType } from '../cloud/database.types'
import { assertAffected, toUserMessage, unwrap, unwrapRows } from '../lib/errors'
import { invalidateBookQueries, queryKeys } from '../lib/queryClient'

/**
 * 账本数据访问层（design.md §4.6 / §4.7 / §5.6）。
 *
 * 隔离两层：用户级靠 RLS（insert 不传 owner_id，由 DEFAULT auth.uid() 填充）；
 * 账本级靠查询条件与前端只展示未归档账本。任何写操作成功后统一使账本维度缓存失效。
 */

export interface BookInput {
  name: string
  type: BookType
  color: string | null
  icon: string | null
}

export const BOOK_TYPES: ReadonlyArray<{ value: BookType; label: string }> = [
  { value: 'personal', label: '个人' },
  { value: 'family', label: '家庭' },
  { value: 'business', label: '生意' },
  { value: 'travel', label: '旅行' },
  { value: 'other', label: '其他' },
]

export const BOOK_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'] as const

export function useBooks() {
  return useQuery({
    queryKey: queryKeys.bookList(),
    queryFn: async (): Promise<BookRow[]> => {
      const rows = unwrapRows(
        await cloud.database.from('books').select('*').order('sort_order'),
      )
      // 同一 sort_order 时用 id 兜底，保证顺序稳定。
      return rows.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
    },
  })
}

/** 当前账本（只在未归档账本里查找，归档账本不会成为上下文）。 */
export function useCurrentBook(bookId: number | null): BookRow | null {
  const { data: books = [] } = useBooks()
  return books.find((book) => book.id === bookId && book.archived_at === null) ?? null
}

/** 创建账本后立刻在单事务内初始化默认账户（§4.7）。 */
export function useCreateBook() {
  return useMutation({
    mutationFn: async (input: BookInput): Promise<number> => {
      const name = input.name.trim()
      if (!name) throw new Error('请输入账本名称')

      const rows = assertAffected(
        await cloud.database
          .from('books')
          .insert({
            name,
            type: input.type,
            base_currency: 'CNY',
            color: input.color,
            icon: input.icon,
            sort_order: 0,
          })
          .select('id'),
      )
      const bookId = rows[0]?.id
      if (!bookId) throw new Error('账本创建失败，请重试')

      const init = await cloud.database.rpc('init_book_template', { p_book_id: bookId })
      if (init.error) {
        // 账本已经建好，不能回滚掉；明确提示用户去账本设置里检查默认账户。
        throw new Error(`账本已创建，但默认账户初始化失败：${toUserMessage(init.error)}`)
      }
      return bookId
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

export function useUpdateBook() {
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: number
      patch: Partial<Pick<BookRow, 'name' | 'type' | 'color' | 'icon' | 'sort_order'>>
    }): Promise<void> => {
      assertAffected(
        await cloud.database
          .from('books')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      )
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

/**
 * 排序只做单点更新：把目标项插到相邻项之前/之后，避免两次 update 交换
 * 在中途失败时留下两个相同的 sort_order。
 */
export function useReorderBook() {
  return useMutation({
    mutationFn: async ({ id, sortOrder }: { id: number; sortOrder: number }): Promise<void> => {
      assertAffected(
        await cloud.database
          .from('books')
          .update({ sort_order: sortOrder, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      )
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

export function useArchiveBook() {
  return useMutation({
    mutationFn: async (bookId: number): Promise<void> => {
      unwrap(await cloud.database.rpc('archive_book', { p_book_id: bookId }))
    },
    onSuccess: () => invalidateBookQueries(),
  })
}

export function useRestoreBook() {
  return useMutation({
    mutationFn: async (bookId: number): Promise<void> => {
      unwrap(await cloud.database.rpc('restore_book', { p_book_id: bookId }))
    },
    onSuccess: () => invalidateBookQueries(),
  })
}
