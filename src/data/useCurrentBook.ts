import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

/**
 * 全局「当前账本」上下文（design.md §4.6 / §7.3）。
 *
 * URL 是权威来源：刷新、书签、手动改地址都能恢复到正确的账本；
 * Zustand 保存最后一次选择，供 /books 这类无 bookId 的页面使用。
 * 切换账本时 setCurrentBookId 会让所有账本维度的 query 缓存失效。
 */

export function bookIdFromPath(pathname: string): number | null {
  const match = /^\/book\/(\d+)(?:\/|$)/.exec(pathname)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** 所有账本相关页面统一用它取 bookId，queryKey 才不会漏掉账本维度。 */
export function useCurrentBookId(): number | null {
  const { pathname } = useLocation()
  const stored = useAppStore((state) => state.currentBookId)
  return bookIdFromPath(pathname) ?? stored
}

/** 挂在 AppShell 内：把 URL 上的账本同步回全局上下文。 */
export function BookScopeSync() {
  const { pathname } = useLocation()
  const setCurrentBookId = useAppStore((state) => state.setCurrentBookId)

  useEffect(() => {
    const id = bookIdFromPath(pathname)
    if (id !== null) setCurrentBookId(id)
  }, [pathname, setCurrentBookId])

  return null
}
