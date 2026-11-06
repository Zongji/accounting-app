import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { describeUser } from '../lib/identity'
import { publicConfig } from '../cloud/publicConfig'

export function MePage() {
  const { user, session, signOut, error } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">我的</h1>
        <p className="mt-1.5 text-sm text-slate-500">账号与会话信息</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-slate-500">登录身份</dt>
            <dd className="font-medium text-slate-800">{describeUser(user)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-slate-500">会话状态</dt>
            <dd className="font-medium text-emerald-600">{session ? '有效' : '未登录'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-slate-500">应用标识</dt>
            <dd className="font-mono text-xs text-slate-500">
              {publicConfig.resourceId.slice(0, 12)}…
            </dd>
          </div>
        </dl>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => navigate('/login', { replace: true }))
          }}
          className="mt-5 w-full rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
        >
          退出登录
        </button>
      </section>

      <p className="text-xs leading-relaxed text-slate-400">
        导出 CSV、归档内容管理将在 P1 阶段实现。所有用户数据均由云端 RLS 按账号隔离，
        切换浏览器登录后数据会原样恢复。
      </p>
    </div>
  )
}
