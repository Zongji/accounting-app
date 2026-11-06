import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { publicConfig } from './publicConfig'
import type { Database } from './database.types'

/**
 * 全应用唯一的 cloud client。Auth / Database / Storage / LLM 共用同一实例。
 * 登录后由 SDK 自动把会话附加到每次数据请求，业务代码不传 token / owner_id。
 * 传入 Database 泛型，使 from() 的行与 rpc() 的参数/返回值都受类型约束。
 */
export const cloud = createWorkBuddyCloud<Database>({
  endpoint: publicConfig.endpoint,
  oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
  publishableKey: publicConfig.publishableKey,
})
