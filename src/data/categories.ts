import { useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import type { CategoryRow } from '../cloud/database.types'
import { unwrapRows } from '../lib/errors'
import { queryKeys } from '../lib/queryClient'

/**
 * 分类下拉数据（design.md §4.7）：内置模板（book_id IS NULL）只读引用 +
 * 当前账本自定义分类。分两次查询再合并，避免 .or() 字符串过滤带来的转义问题。
 */
export function useCategoryOptions(bookId: number | null) {
  return useQuery({
    queryKey: queryKeys.categoryOptions(bookId),
    enabled: bookId !== null,
    queryFn: async (): Promise<CategoryRow[]> => {
      const templates = unwrapRows(
        await cloud.database
          .from('categories')
          .select('*')
          .is('book_id', null)
          .is('archived_at', null)
          .order('sort_order'),
      )
      if (bookId === null) return templates

      const custom = unwrapRows(
        await cloud.database
          .from('categories')
          .select('*')
          .eq('book_id', bookId)
          .is('archived_at', null)
          .order('sort_order'),
      )
      return [...custom, ...templates]
    },
  })
}
