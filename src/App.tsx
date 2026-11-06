import { lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import type { StartupNotice } from './auth/restoreAuth'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { FoundationPage } from './pages/FoundationPage'
import { MePage } from './pages/MePage'
import { BooksPage } from './pages/BooksPage'
import { BookSettingsPage } from './pages/BookSettingsPage'
import { OverviewPage } from './pages/OverviewPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { TxnDetailPage } from './pages/TxnDetailPage'
import { AccountDetailPage } from './pages/AccountDetailPage'

/**
 * 报表页依赖 Recharts（体积较大），延迟到首次访问 /reports 时再加载，
 * 避免拖慢登录、账本、明细等高频首屏路径。图表库因此独立成单独 chunk。
 */
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })),
)

function LazyFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-400">
      正在加载报表…
    </div>
  )
}

/** 登录门禁：任何涉及用户数据的页面都必须先有真实会话（design.md §6.2）。 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">
        正在恢复登录状态…
      </div>
    )
  }
  if (status === 'signedOut') return <Navigate to="/login" replace />
  return <>{children}</>
}

export function App({ startupNotice }: { startupNotice?: StartupNotice | null }) {
  return (
    // 静态托管没有 history fallback → 必须用 HashRouter；OAuth 回调落在站点根路径。
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage startupNotice={startupNotice} />} />

          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            {/* 进入应用默认落在概览：有当前账本时 AppShell 的导航可直接带过去 */}
            <Route path="/" element={<Navigate to="/books" replace />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/foundation" element={<FoundationPage />} />
            <Route path="/me" element={<MePage />} />

            {/* §7.4 账本作用域路由（P0 全部业务页面已接入） */}
            <Route path="/book/:bookId/overview" element={<OverviewPage />} />
            <Route path="/book/:bookId/transactions" element={<TransactionsPage />} />
            <Route path="/book/:bookId/txn/:txnId" element={<TxnDetailPage />} />
            <Route path="/book/:bookId/accounts/:accountId" element={<AccountDetailPage />} />
            <Route
              path="/book/:bookId/reports"
              element={
                <Suspense fallback={<LazyFallback />}>
                  <ReportsPage />
                </Suspense>
              }
            />
            <Route path="/book/:bookId/settings" element={<BookSettingsPage />} />

            <Route path="*" element={<Navigate to="/books" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
