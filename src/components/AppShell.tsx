import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { describeUser } from '../lib/identity'
import { useCurrentBook } from '../data/books'
import { BookScopeSync, useCurrentBookId } from '../data/useCurrentBook'
import { useAppStore } from '../store/useAppStore'
import { TransactionSheet } from './TransactionSheet'

type IconName = 'books' | 'overview' | 'plus' | 'check' | 'me' | 'list' | 'chart' | 'settings'

const ICON_PATHS: Record<IconName, string> = {
  books: 'M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5z M8 4v16',
  overview: 'M4 19V9m5 10V5m5 14v-7m5 7V7',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6 9 17l-5-5',
  me: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M12 3a9 9 0 1 0 9 9h-9z M15 3.5A8.5 8.5 0 0 1 20.5 9H15z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3-2-1 0-2 2-1-2-3.5-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 3.5 2 1v2l-2 1 2 3.5 2-1 2 1 1 2h4l1-2 2-1 2 1 2-3.5-2-1v-2z',
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

interface NavItem {
  label: string
  /** 账本作用域后缀；为 null 表示全局路由 */
  scope: string | null
  to: string
  icon: IconName
  /** 打开全局记一笔浮层 */
  create?: boolean
  primary?: boolean
}

/** 手机底部 5 项 Tab（design.md §7.2 <768px）：概览/明细/记账/报表/我的 */
const MOBILE_TABS: NavItem[] = [
  { label: '概览', scope: 'overview', to: '', icon: 'overview' },
  { label: '明细', scope: 'transactions', to: '', icon: 'list' },
  { label: '记一笔', scope: null, to: '', icon: 'plus', primary: true, create: true },
  { label: '报表', scope: 'reports', to: '', icon: 'chart' },
  { label: '我的', scope: null, to: '/me', icon: 'me' },
]

export function AppShell() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentBookId = useCurrentBookId()
  const currentBook = useCurrentBook(currentBookId)
  const openCreateSheet = useAppStore((state) => state.openCreate)
  const [toast, setToast] = useState<string | null>(null)

  /** 没有当前账本时，账本作用域的链接统一落到账本列表，避免拼出 /book/null/*。 */
  const scopedPath = (suffix: string) =>
    currentBookId !== null ? `/book/${currentBookId}/${suffix}` : '/books'

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2200)
  }

  function openCreate() {
    if (currentBookId === null) {
      notify('请先进入一个账本')
      navigate('/books')
      return
    }
    openCreateSheet()
  }

  // PC 快捷键：N 新建、Esc 关闭（Esc 由 Modal 内部处理）。
  // 输入控件内不触发，避免打字时误开表单。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'n' && event.key !== 'N') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog) return
      event.preventDefault()
      openCreate()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBookId])

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const activeClass = 'bg-indigo-50 text-indigo-700'
  const idleClass = 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'

  /**
   * 作用域链接只在真正进入该账本的对应页面时高亮。
   * 没有当前账本时它们都退化成 /books，不能因为 pathname=/books 就 4 个同时高亮。
   */
  function isLinkActive(item: NavItem): boolean {
    if (item.scope === null) return pathname === item.to
    return (
      currentBookId !== null &&
      pathname.startsWith(`/book/${currentBookId}/${item.scope}`)
    )
  }

  const sidebarLinks: NavItem[] = [
    { label: '账本列表', scope: null, to: '/books', icon: 'books' },
    { label: '概览', scope: 'overview', to: scopedPath('overview'), icon: 'overview' },
    { label: '流水明细', scope: 'transactions', to: scopedPath('transactions'), icon: 'list' },
    { label: '月度报表', scope: 'reports', to: scopedPath('reports'), icon: 'chart' },
    { label: '账本设置', scope: 'settings', to: scopedPath('settings'), icon: 'settings' },
    { label: '地基自检', scope: null, to: '/foundation', icon: 'check' },
    { label: '我的', scope: null, to: '/me', icon: 'me' },
  ]

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 lg:flex">
      <BookScopeSync />

      {/* PC / 平板：左侧固定导航（design.md §7.2 ≥768px 窄侧栏 / ≥1024px 固定） */}
      <aside className="hidden w-48 shrink-0 flex-col border-r border-slate-200 bg-white md:flex lg:h-dvh lg:sticky lg:top-0 lg:w-60">
        <div className="flex items-center gap-3 px-4 py-6 lg:px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Icon name="books" className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">多账本记账</p>
            <p className="text-[11px] text-slate-400">P0 · 完整链路</p>
          </div>
        </div>

        <div className="mx-3 mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 lg:mx-4">
          <p className="text-[11px] text-slate-400">当前账本</p>
          <p className="mt-0.5 truncate text-sm font-medium text-slate-700">
            {currentBook?.name ?? '尚未选择'}
          </p>
          <NavLink to="/books" className="mt-1 inline-block text-[11px] text-indigo-600 hover:underline">
            切换账本 →
          </NavLink>
        </div>

        <div className="mx-3 mb-4 lg:mx-4">
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Icon name="plus" className="h-4 w-4" />
            记一笔 <span className="hidden text-[10px] font-normal opacity-70 lg:inline">N</span>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2 lg:px-3">
          {sidebarLinks.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isLinkActive(item) ? activeClass : idleClass
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <p className="mb-2 truncate text-xs text-slate-500">{describeUser(user)}</p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            退出登录
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 手机顶栏：账本名可点击切换 */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <NavLink to="/books" className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Icon name="books" className="h-4 w-4" />
            </div>
            <span className="truncate text-sm font-semibold">{currentBook?.name ?? '多账本记账'}</span>
            <span className="text-[10px] text-slate-400">切换 ›</span>
          </NavLink>
          <button type="button" onClick={() => void onSignOut()} className="shrink-0 text-xs text-slate-500 hover:text-rose-600">
            退出
          </button>
        </header>

        <main className="flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10 lg:px-8 lg:py-8">
          <Outlet />
        </main>

        {/* 平板 / PC：右下悬浮记账按钮；手机由底部 Tab 承担 */}
        <button
          type="button"
          onClick={openCreate}
          aria-label="记一笔"
          className="fixed bottom-8 right-8 z-20 hidden h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 md:flex"
        >
          <Icon name="plus" className="h-6 w-6" />
        </button>
      </div>

      {/* 手机：底部 5 项 Tab（design.md §7.2 <768px） */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((item) => {
            const content = (
              <>
                <Icon name={item.icon} className={item.primary ? 'h-6 w-6' : 'h-5 w-5'} />
                <span className="mt-1 text-[10px] font-medium">{item.label}</span>
              </>
            )
            if (item.create) {
              return (
                <button key={item.label} type="button" onClick={openCreate} className="flex flex-col items-center justify-center py-2.5 text-indigo-600">
                  {content}
                </button>
              )
            }
            const to = item.scope === null ? item.to : scopedPath(item.scope)
            const active = isLinkActive(item)
            return (
              <Link
                key={item.label}
                to={to}
                className={`flex flex-col items-center justify-center py-2.5 ${
                  active ? 'text-indigo-600' : 'text-slate-500'
                }`}
              >
                {content}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* 全局记账浮层：手机全屏 Sheet / PC 居中 Modal，新建与编辑共用 */}
      <TransactionSheet />

      {toast && (
        <div role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-800 px-4 py-2 text-xs text-white shadow-lg md:bottom-8">
          {toast}
        </div>
      )}
    </div>
  )
}
