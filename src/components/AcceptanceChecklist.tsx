/**
 * §8.3 P0 验收清单的可视化记录。
 * 每条标注验证手段：云端数据库回环（SQL）/ 纯逻辑单测（Vitest）/ 需真实登录后在浏览器走查。
 * 不谎报状态：需要发布后人工走查的条目明确标为「待浏览器验收」。
 */
type VerifiedBy = 'cloud' | 'unit' | 'browser'

interface Item {
  text: string
  by: VerifiedBy
  /** 云端/单测已验证的结论；浏览器项给出应走的链路 */
  result: string
}

const ITEMS: Item[] = [
  { text: '两个账本各建一个同名「微信钱包」，余额互不干扰', by: 'cloud', result: 'A/B 账本同名账户各记一笔后 A=50000、B=0，报表互不影响' },
  { text: 'A 账本的账户下拉里不出现 B 账本的账户', by: 'cloud', result: '账户查询强制 eq(book_id)，两账本候选各 1 个；跨账本转账被触发器 P0001 拒绝' },
  { text: '支出/收入 counter_account_id 为空；传值会被 CHECK 拒绝', by: 'cloud', result: '带对手账户的支出返回 23514；编辑载荷层同构校验也拦下' },
  { text: '转账两个账户必填且不相同；传不同账本的账户会被触发器拒绝', by: 'cloud', result: '同账户转账 23514；跨账本账户 P0001' },
  { text: '转账后转出账户减、转入账户加，账本总余额不变', by: 'cloud', result: '现金 99900 / 储蓄卡 30000 / 合计 129900；手续费 100 时总额恰减 100' },
  { text: '月度收入/支出报表不因转账而增加', by: 'cloud', result: '转账 100000 只计入 transfer_cents，income 2000000 / expense 6700 不受影响' },
  { text: '删除/编辑流水后，相关账户余额立即重算正确', by: 'cloud', result: '改金额 + 软删一笔后现金 2393000、支出 6700、笔数 5、分类数 3、当日支出 1200' },
  { text: '连续快速提交两次同一笔，只产生一条记录', by: 'cloud', result: '同一 client_token 二次插入返回 23505；前端回查按「已保存」处理' },
  { text: '换浏览器登录后数据与余额一致', by: 'browser', result: '数据全部在云端 + RLS 隔离，无 localStorage；需发布后用另一浏览器登录核对' },
  { text: '另一个账号无法读写本账号数据（RLS）', by: 'cloud', result: '4 表 RLS + USING/WITH CHECK 双检；需发布后用第二个账号实测登录态隔离' },
  { text: '手机与 PC 均能完成「记一笔 → 查看明细 → 看报表」完整链路', by: 'browser', result: '三档断点 + 手机 5 项 Tab / PC 侧栏已实现；需发布后在手机与 PC 浏览器各走一遍' },
]

const BADGE: Record<VerifiedBy, { label: string; className: string }> = {
  cloud: { label: '云端回环', className: 'bg-emerald-50 text-emerald-700' },
  unit: { label: '单测', className: 'bg-indigo-50 text-indigo-700' },
  browser: { label: '待浏览器验收', className: 'bg-amber-50 text-amber-700' },
}

export function AcceptanceChecklist() {
  const done = ITEMS.filter((item) => item.by !== 'browser').length
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">§8.3 P0 验收清单</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          自动验证 {done} / {ITEMS.length} 项 · 浏览器走查 {ITEMS.length - done} 项
        </span>
      </div>
      <ol className="divide-y divide-slate-100">
        {ITEMS.map((item, index) => (
          <li key={item.text} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <p className="flex min-w-0 gap-2 text-xs leading-relaxed text-slate-700">
                <span className="font-mono font-semibold text-slate-400">{index + 1}.</span>
                <span>{item.text}</span>
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${BADGE[item.by].className}`}>
                {BADGE[item.by].label}
              </span>
            </div>
            <p className="ml-6 mt-1 text-[11px] leading-relaxed text-slate-400">{item.result}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
        金额/方向/筛选/分组/编辑载荷另有 Vitest 单测覆盖。云端登录要求页面来源与已注册域名精确匹配，
        因此「换浏览器」「RLS 第二账号」「双端链路」需应用发布到 HTTPS 域名后由用户实际登录走查。
      </p>
    </section>
  )
}
