import { Link } from 'react-router-dom'

interface Props {
  title: string
  description: string
  phase: string
}

/** P0 地基阶段的占位页：路由与导航骨架先就位，业务页面在后续阶段填充。 */
export function PlaceholderPage({ title, description, phase }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{description}</p>
        <span className="mt-4 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
          {phase}
        </span>
        <p className="mt-6">
          <Link to="/foundation" className="text-sm text-indigo-600 hover:underline">
            返回地基自检 →
          </Link>
        </p>
      </div>
    </div>
  )
}
