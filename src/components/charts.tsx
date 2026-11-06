import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCents } from '../lib/money'
import { TXN_META } from './ui'
import { toPercent } from '../lib/transactionView'

/**
 * 报表图表（design.md §7.1 / §7.2）。
 * 金额一律以「分」传入，只在 Tooltip / 坐标轴格式化为元，避免浮点累加。
 * 国内习惯：支出红、收入绿（§7.2），与 TXN_META 共用同一套颜色。
 */

export const INCOME_COLOR = TXN_META.income.color
export const EXPENSE_COLOR = TXN_META.expense.color
export const PIE_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#14b8a6', '#ec4899', '#f97316', '#64748b',
] as const

const axisStyle = { fontSize: 11, fill: '#94a3b8' }
const gridStroke = '#eef2f7'

function tooltipFormatter(value: unknown): [string, string] {
  return [formatCents(typeof value === 'number' ? value : 0), '金额']
}

/** 近 N 月收入/支出双柱：X 轴 'YYYY-MM'。 */
export function MonthlyTrendChart({
  data,
}: {
  data: Array<{ month: string; income: number; expense: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={62}
          tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 100)}`)}
        />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `${label} 月`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="收入" fill={INCOME_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expense" name="支出" fill={EXPENSE_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** 当月每日收支折线：X 轴 'YYYY-MM-DD' 只显示日。 */
export function DailyTrendChart({
  data,
}: {
  data: Array<{ day: string; income: number; expense: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey="day"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => String(Number(v.slice(-2)))}
          minTickGap={12}
        />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={62}
          tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 100)}`)}
        />
        <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `${label}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="income" name="收入" stroke={INCOME_COLOR} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="expense" name="支出" stroke={EXPENSE_COLOR} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** 分类占比环形图 + 右侧明细列表，前几名按固定调色板着色。 */
export function CategoryPieChart({
  data,
}: {
  data: Array<{ name: string; value: number; count: number }>
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <div className="grid items-center gap-4 md:grid-cols-2">
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((item, index) => (
                <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={tooltipFormatter} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5">
        {data.map((item, index) => (
          <li key={item.name} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className="truncate text-slate-600">{item.name}</span>
              <span className="shrink-0 text-slate-400">{item.count} 笔</span>
            </div>
            <div className="shrink-0 text-right">
              <span className="tabular font-medium text-slate-700">{formatCents(item.value)}</span>
              <span className="tabular ml-2 w-10 inline-block text-slate-400">
                {toPercent(item.value, total)}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 账户余额分布横向柱状图。 */
export function AccountBalanceChart({
  data,
}: {
  data: Array<{ name: string; balance: number }>
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38 + 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={gridStroke} horizontal={false} />
        <XAxis
          type="number"
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 100)}`)}
        />
        <YAxis type="category" dataKey="name" tick={axisStyle} tickLine={false} axisLine={false} width={72} />
        <Tooltip formatter={tooltipFormatter} />
        <Bar dataKey="balance" name="余额" radius={[0, 3, 3, 0]} maxBarSize={20}>
          {data.map((item) => (
            <Cell key={item.name} fill={item.balance < 0 ? EXPENSE_COLOR : '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
