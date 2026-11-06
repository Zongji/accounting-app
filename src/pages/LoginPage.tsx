import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { cloud } from '../cloud/client'
import { useAuth } from '../auth/AuthProvider'
import type { StartupNotice } from '../auth/restoreAuth'
import { toUserMessage } from '../lib/errors'

type Channel = 'email' | 'phone'

interface PendingOtp {
  channel: Channel
  recipient: string
  verificationId: string
  isExistingUser: boolean
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^1\d{10}$/
const RESEND_SECONDS = 60

export function LoginPage({ startupNotice }: { startupNotice?: StartupNotice | null }) {
  const navigate = useNavigate()
  const { status, refresh } = useAuth()

  const [channel, setChannel] = useState<Channel>('email')
  const [recipient, setRecipient] = useState('')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<PendingOtp | null>(null)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [formError, setFormError] = useState<string | null>(startupNotice?.message ?? null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  if (status === 'signedIn') return <Navigate to="/books" replace />
  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">
        正在恢复登录状态…
      </div>
    )
  }

  function switchChannel(next: Channel) {
    setChannel(next)
    setRecipient('')
    setCode('')
    setPending(null)
    setFormError(null)
    setFieldError(null)
    setNotice(null)
    setCooldown(0)
  }

  function onRecipientChange(value: string) {
    setRecipient(value)
    setFieldError(null)
    // 收件人变了，旧验证码作废，必须重新获取（不发请求）。
    setPending(null)
    setNotice(null)
  }

  function validateRecipient(): boolean {
    if (channel === 'email' && !EMAIL_PATTERN.test(recipient.trim())) {
      setFieldError('请输入正确的邮箱地址')
      return false
    }
    if (channel === 'phone' && !PHONE_PATTERN.test(recipient.trim())) {
      setFieldError('请输入正确的 11 位手机号')
      return false
    }
    setFieldError(null)
    return true
  }

  async function sendCode() {
    if (!validateRecipient()) return
    setBusy('send')
    setFormError(null)
    setNotice(null)
    try {
      const clean = recipient.trim()
      const sent =
        channel === 'email'
          ? await cloud.auth.sendOtp({ email: clean })
          : await cloud.auth.sendOtp({ phone: clean })

      if (sent.error || !sent.data) {
        setFormError(toUserMessage(sent.error))
        return // 发码失败不能继续验码，也不能提示「已发送」
      }
      setPending({
        channel,
        recipient: clean,
        verificationId: sent.data.verificationId,
        isExistingUser: sent.data.isExistingUser,
      })
      setCooldown(RESEND_SECONDS)
      setNotice('验证码已发送，请在有效期内输入')
    } catch (error) {
      setFormError(toUserMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const clean = recipient.trim()
    if (!pending || pending.channel !== channel || pending.recipient !== clean) {
      setFormError('请先为当前的邮箱/手机号获取验证码')
      return
    }
    if (!code.trim()) {
      setFormError('请输入验证码')
      return
    }

    setBusy('verify')
    try {
      const shared = {
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: code.trim(),
      }
      // email 与 phone 互斥，且必须与发码时用的是同一个值。
      const completed =
        pending.channel === 'email'
          ? await cloud.auth.verifyOtp({ ...shared, email: pending.recipient })
          : await cloud.auth.verifyOtp({ ...shared, phone: pending.recipient })

      if (completed.error || !completed.data) {
        // 验证码错误时复用同一个 challenge 重试，绝不重新发码。
        setFormError(toUserMessage(completed.error))
        return
      }
      setPending(null)
      setNotice(null)
      await refresh()
      navigate('/books', { replace: true })
    } catch (error) {
      setFormError(toUserMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const isBusy = busy !== null

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[linear-gradient(160deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
        <header className="mb-7">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 17.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8M8 13h5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">多账本记账</h1>
          <p className="mt-1.5 text-sm text-slate-500">每一笔，各归其账。登录后数据自动同步到云端。</p>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="登录方式">
          {(['email', 'phone'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={channel === item}
              onClick={() => switchChannel(item)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                channel === item
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {item === 'email' ? '邮箱验证码' : '手机号验证码'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="recipient" className="mb-1.5 block text-sm font-medium text-slate-700">
            {channel === 'email' ? '邮箱地址' : '手机号'}
          </label>
          <input
            id="recipient"
            type={channel === 'email' ? 'email' : 'tel'}
            inputMode={channel === 'email' ? 'email' : 'numeric'}
            autoComplete={channel === 'email' ? 'email' : 'tel'}
            placeholder={channel === 'email' ? 'you@example.com' : '请输入 11 位手机号'}
            value={recipient}
            onChange={(event) => onRecipientChange(event.target.value)}
            disabled={isBusy}
            aria-invalid={fieldError !== null}
            className={`w-full rounded-lg border px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 ${
              fieldError ? 'border-rose-400 focus:border-rose-400' : 'border-slate-300 focus:border-indigo-500'
            }`}
          />
          {fieldError && <p className="mt-1.5 text-xs text-rose-600">{fieldError}</p>}

          <label htmlFor="otp" className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">
            验证码
          </label>
          <div className="flex gap-2">
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="请输入验证码"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={isBusy}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={sendCode}
              disabled={isBusy || cooldown > 0}
              className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : pending ? '重新获取' : '获取验证码'}
            </button>
          </div>

          {notice && <p className="mt-2 text-xs text-emerald-600">{notice}</p>}
          {formError && (
            <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'verify' ? '正在登录…' : '登录 / 注册'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          首次登录将自动创建账号。微信扫码与 WorkBuddy 账号登录
          <br className="hidden sm:block" />
          将在应用发布到 HTTPS 域名后接入。
        </p>
      </section>
    </main>
  )
}
