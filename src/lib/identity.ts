/**
 * 用户标识的展示辅助：只输出脱敏结果。
 * design.md §6.6：日志与界面不输出完整 token、手机号、邮箱或原始行数据。
 */

/** 只保留首尾少量字符。 */
export function mask(value: string): string {
  if (value.length <= 6) return `${value.slice(0, 2)}***`
  return `${value.slice(0, 3)}***${value.slice(-4)}`
}

/** 从会话 user 中挑一个可展示字段并脱敏；未知字段一律不回显。 */
export function describeUser(user: unknown): string {
  const record = (user ?? {}) as Record<string, unknown>
  const key = ['name', 'email', 'phone'].find(
    (field) => typeof record[field] === 'string' && String(record[field]).length > 0,
  )
  if (key) return mask(String(record[key]))
  const id = typeof record.id === 'string' ? record.id : ''
  return id ? `用户 ${mask(id)}` : '已验证身份'
}
