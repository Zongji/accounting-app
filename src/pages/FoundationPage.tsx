import { useQuery } from '@tanstack/react-query'
import { cloud } from '../cloud/client'
import { useAuth } from '../auth/AuthProvider'
import { useAppStore } from '../store/useAppStore'
import { queryKeys } from '../lib/queryClient'
import { toUserMessage } from '../lib/errors'
import { describeUser } from '../lib/identity'
import { AcceptanceChecklist } from '../components/AcceptanceChecklist'

interface CheckResult {
  key: string
  label: string
  ok: boolean
  detail: string
}

async function runFoundationChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const push = (key: string, label: string, ok: boolean, detail: string) =>
    results.push({ key, label, ok, detail })

  // 1. 会话门禁：任何用户数据查询之前必须有真实身份
  const { data: session, error: sessionError } = await cloud.auth.getSession()
  push(
    'session',
    '会话与身份',
    Boolean(session) && !sessionError,
    session ? `已登录 · ${describeUser(session.user)}` : toUserMessage(sessionError),
  )

  // 2. 用户级隔离：books 表带 RLS，未登录时不会返回任何行
  try {
    const { data, error } = await cloud.database.from('books').select('id').limit(5)
    push(
      'books',
      '账本表读取（RLS）',
      !error,
      error ? toUserMessage(error) : `读取成功，当前账号可见 ${Array.isArray(data) ? data.length : 0} 条`,
    )
  } catch (error) {
    push('books', '账本表读取（RLS）', false, toUserMessage(error))
  }

  // 3. 内置分类模板：验证 categories_read_template 的公开只读策略
  try {
    const { data, error } = await cloud.database
      .from('categories')
      .select('id,name,kind')
      .is('book_id', null)
      .order('sort_order')
      .limit(30)
    push(
      'categories',
      '内置分类模板',
      !error,
      error ? toUserMessage(error) : `读取成功，共 ${Array.isArray(data) ? data.length : 0} 个模板`,
    )
  } catch (error) {
    push('categories', '内置分类模板', false, toUserMessage(error))
  }

  // 4. 账户表读取：记账主链路新增的表，验证 RLS 与表授权
  try {
    const { error } = await cloud.database.from('accounts').select('id').limit(1)
    push(
      'accounts',
      '账户表读取（RLS）',
      !error,
      error ? toUserMessage(error) : '读取成功，账户下拉可用',
    )
  } catch (error) {
    push('accounts', '账户表读取（RLS）', false, toUserMessage(error))
  }

  // 5. 流水表读取：验证写入前的表授权与账本级过滤
  try {
    const { error } = await cloud.database
      .from('transactions')
      .select('id')
      .eq('book_id', 0)
      .limit(1)
    push(
      'transactions',
      '流水表读取（RLS）',
      !error,
      error ? toUserMessage(error) : '读取成功，账本维度过滤可用',
    )
  } catch (error) {
    push('transactions', '流水表读取（RLS）', false, toUserMessage(error))
  }

  // 6. 月报 RPC 连通性：无数据的账本也应返回一行全 0 汇总
  try {
    const { data, error } = await cloud.database.rpc('book_monthly_summary', { p_book_id: 0 })
    push(
      'rpc',
      '月报 RPC（book_monthly_summary）',
      !error,
      error ? toUserMessage(error) : `调用成功，返回 ${Array.isArray(data) ? data.length : 0} 行`,
    )
  } catch (error) {
    push('rpc', '月报 RPC（book_monthly_summary）', false, toUserMessage(error))
  }

  // 7-8. 明细/报表阶段新增的两个报表 RPC：空区间也应正常返回，不报错。
  const from = '2030-01-01'
  const to = '2030-01-31'
  try {
    const { error } = await cloud.database.rpc('category_breakdown', {
      p_book_id: 0, p_from: from, p_to: to, p_kind: 'expense',
    })
    push('rpc-category', '分类占比 RPC', !error, error ? toUserMessage(error) : '调用成功，空区间返回 0 行')
  } catch (error) {
    push('rpc-category', '分类占比 RPC', false, toUserMessage(error))
  }
  try {
    const { data, error } = await cloud.database.rpc('daily_trend', {
      p_book_id: 0, p_from: from, p_to: to,
    })
    push(
      'rpc-trend',
      '每日趋势 RPC',
      !error,
      error ? toUserMessage(error) : `调用成功，补零返回 ${Array.isArray(data) ? data.length : 0} 天`,
    )
  } catch (error) {
    push('rpc-trend', '每日趋势 RPC', false, toUserMessage(error))
  }

  return results
}

const DONE_ITEMS = [
  '工程与依赖、SDK 单实例（配置取自 publicConfig）',
  '§4.2 DDL + §4.3 索引 + §4.4 触发器 + §4.5 RLS',
  'account_balance / book_balance_snapshot / book_monthly_summary',
  '登录页 + 会话门禁 + HashRouter 路由骨架',
  '账本列表 + 新建/编辑/排序/归档/恢复 + 当前账本上下文',
  '账户配置 + 模板初始化/归档 RPC + 实时余额',
  '记一笔（三类型 + 账户互斥 + 整数分 + client_token 幂等）',
  '明细列表 / 流水详情 / 账户详情 / 编辑 / 软删除',
  '概览与月度报表（分类占比 + 每日趋势 + 近 6 月趋势）',
  '响应式三档布局、手机 5 项 Tab、PC 侧栏与 N 快捷键',
  '§8.3 验收清单逐项验证（云端回环 + 纯逻辑单测）',
]

/** P1 增强范围（design.md §8.1）；本阶段不再有未完成项。 */
const NEXT_ITEMS = [
  '自定义分类（当前只读引用内置模板）',
  '预算、小票上传、CSV 导出',
  '搜索筛选增强、账户/分类归档内容管理',
  '共享账本、多币种、PWA 离线草稿（P2）',
]

export function FoundationPage() {
  const { user } = useAuth()
  const currentBookId = useAppStore((state) => state.currentBookId)
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.foundation(currentBookId),
    queryFn: runFoundationChecks,
    retry: 0,
  })

  const checks = data ?? []
  const allOk = checks.length === 8 && checks.every((item) => item.ok)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">P0 · 地基自检</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">环境与数据层</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          登录态、RLS、模板分类与报表函数的连通性检查。当前登录身份：{describeUser(user)}。
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                isLoading ? 'bg-slate-300' : allOk ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <h2 className="text-sm font-semibold text-slate-800">
              {isLoading ? '正在检测…' : allOk ? '全部通过' : '存在未通过项'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetching ? '检测中…' : '重新检测'}
          </button>
        </div>

        {isError && (
          <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {toUserMessage(error)}
          </p>
        )}

        <ul className="divide-y divide-slate-100">
          {checks.length === 0 && !isLoading && (
            <li className="py-3 text-sm text-slate-400">暂无检测结果</li>
          )}
          {checks.map((item) => (
            <li key={item.key} className="flex items-start gap-3 py-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  item.ok ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              >
                {item.ok ? '✓' : '!'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="mt-0.5 break-words text-xs text-slate-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
          云端登录要求页面来源与已注册域名精确匹配。若在本地预览中看到权限/凭据错误，
          需要把应用发布到本应用的 HTTPS 域名后再验证完整登录链路。
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-emerald-800">P0 已完成（§8.2 全 11 步）</h2>
          <ol className="space-y-2">
            {DONE_ITEMS.map((item, index) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-emerald-900/80">
                <span className="font-mono font-semibold text-emerald-600">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">P1 / P2 增强范围</h2>
          <ol className="space-y-2">
            {NEXT_ITEMS.map((item, index) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-slate-500">
                <span className="font-mono font-semibold text-slate-400">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <AcceptanceChecklist />
    </div>
  )
}
