import { cloud } from '../cloud/client'
import { toUserMessage } from '../lib/errors'

export interface StartupNotice {
  kind: 'error' | 'info'
  message: string
}

type WebOAuthProvider = 'wechat' | 'workbuddy'

/**
 * 应用启动时的 OAuth 回调分发，必须在任何路由门禁之前执行。
 *
 * 静态托管没有 history fallback，回调只能落在站点根路径；门禁若先跑会把
 * URL 上单次的 code 丢掉。当前阶段登录页只开放邮箱/手机号验证码，
 * 这里先把分发器与启动入口做好，后续接微信/WorkBuddy 登录无需改动启动流程。
 */
export async function restoreAuth(): Promise<StartupNotice | null> {
  const url = new URL(location.href)
  const hasCallback = url.searchParams.has('code') || url.searchParams.has('error')
  if (!hasCallback) return null // 普通访问：交给 AuthProvider.getSession() 恢复会话

  const provider = url.searchParams.get('provider')
  if (provider !== 'wechat' && provider !== 'workbuddy') {
    return {
      kind: 'error',
      message: url.searchParams.has('error')
        ? '授权未成功，请重新登录'
        : '授权回调缺少有效的登录方式，请重新登录',
    }
  }

  const { data: session, error } =
    provider === 'workbuddy'
      ? await cloud.auth.handleWorkBuddyCallback(url.search)
      : await cloud.auth.handleWechatWebCallback(url.search)

  if (error) return { kind: 'error', message: toUserMessage(error) }
  if (!session) return null

  // 只清理回调参数，保留业务 query 与 hash；否则刷新会重放已消费的 code。
  for (const key of ['code', 'state', 'provider']) url.searchParams.delete(key)
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  return null
}

/**
 * 网页 OAuth 登录入口（下一阶段接入微信/WorkBuddy 登录时使用）。
 * 必须由用户手势在同一标签页触发：PKCE verifier 存在当前标签页的 sessionStorage。
 */
export async function startOAuthSignIn(provider: WebOAuthProvider): Promise<string | null> {
  const back = new URL(location.href)
  back.pathname = '/'
  for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key)

  const { data, error } = await cloud.auth.signInWithOAuth({
    provider,
    redirectTo: back.toString(),
  })
  if (error) return toUserMessage(error)
  if (!data?.url) return '未返回登录地址，请稍后重试'

  location.assign(data.url) // 同标签页，不能 window.open
  return null
}
