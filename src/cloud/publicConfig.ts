/**
 * 应用唯一的云端公开配置来源。
 *
 * 这些值由云服务环境开通时返回的 `publicConfig` 原样落盘生成，属于可公开下发的
 * 配置（publishableKey 本身不带权限，服务端还会校验 Origin 精确匹配）。
 *
 * 约束（design.md §3.3）：
 *   - 不从 window.location / import.meta.env / 任何约定推导；
 *   - 不在其它文件里重复写字面量；
 *   - 只被 client.ts 消费一次，全应用只创建一个 client 实例。
 *
 * 若重新绑定了云环境，只需同步更新本文件，其余代码无需改动。
 */
export const publicConfig = {
  resourceId: 'wbcs_HR4qQPkA3uKg5yfTPQ3BUP',
  endpoint: 'https://multi-ledger-86783.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_dnG3lngc9uTnP7d5CzUUSI_ZpSi1GKU2m1PlSE2C74TgS9QJPuxI957',
} as const
