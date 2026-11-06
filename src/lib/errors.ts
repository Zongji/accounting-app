/**
 * 统一的错误归一（design.md §6.5）。
 * 按稳定的 error.code / error.kind 分支，不按 message 文本判断；
 * 不把原始行数据、token、手机号、邮箱写进日志或界面。
 */

export interface CloudLikeError {
  code?: string
  kind?: string
  message?: string
  details?: string
  hint?: string
}

function asCloudError(error: unknown): CloudLikeError | null {
  if (!error || typeof error !== 'object') return null
  return error as CloudLikeError
}

export function errorCode(error: unknown): string | undefined {
  return asCloudError(error)?.code
}

export function isDuplicateError(error: unknown): boolean {
  return errorCode(error) === '23505'
}

/** 把任意云端错误翻译成可展示的中文提示。 */
export function toUserMessage(error: unknown): string {
  if (error instanceof TypeError) return '网络连接失败，请检查网络后重试'
  if (error == null) return '发生未知错误，请重试'

  const e = asCloudError(error)
  if (!e) return '发生未知错误，请重试'

  switch (e.code) {
    case '23505':
      return '这笔记录已经保存，无需重复提交'
    case '23514':
      return '流水与账户的关联不符合规则，请检查类型与账户选择'
    case '23503':
      return '引用的账户或分类不存在'
    case '42501':
      return '没有权限执行该操作，请确认已登录且数据属于当前账号'
    case '42P01':
      return '数据表尚未创建，请联系应用管理员'
    case 'P0001':
      return '归属校验未通过：账本不存在、已归档，或账户不属于当前账本'
    default:
      break
  }

  switch (e.kind) {
    case 'unauthenticated':
    case 'invalid_grant':
      return '登录状态已失效，请重新登录'
    case 'network':
      return '网络连接失败，请检查网络后重试'
    case 'backend-unavailable':
      return '云服务暂时不可用，请稍后重试'
    default:
      break
  }

  // message 可能包含后端细节，只作为兜底并截断，避免把内部信息铺到界面上。
  const message = (e.message ?? '').trim()
  return message ? message.slice(0, 160) : '操作失败，请重试'
}

/** 把 { data, error } 信封转成抛错语义，业务代码不必每个调用点写 if (error)。 */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error(toUserMessage(result.error), { cause: result.error })
  return result.data
}

/** 列表查询：null data 归一为空数组，同时保留 unwrap 的错误语义。 */
export function unwrapRows<T>(result: { data: T[] | null; error: unknown }): T[] {
  const rows = unwrap(result)
  return Array.isArray(rows) ? rows : []
}

/**
 * 写操作后检查受影响行数。
 * RLS 拦下时 PostgREST 返回空数组且没有 error，不能当成成功（design.md §4.5）。
 */
export function assertAffected<T>(result: { data: T[] | null; error: unknown }): T[] {
  const rows = unwrap(result)
  const affected = Array.isArray(rows) ? rows : []
  if (affected.length === 0) {
    throw new Error('没有记录被修改：数据可能不存在，或不属于当前账号')
  }
  return affected
}
