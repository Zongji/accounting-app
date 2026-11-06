import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CloudSession, CloudUser } from '@tencent-ai/workbuddy-cloud-sdk'
import { cloud } from '../cloud/client'
import { toUserMessage } from '../lib/errors'

type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

interface AuthContextValue {
  status: AuthStatus
  session: CloudSession | null
  user: CloudUser | null
  error: string | null
  /** 登录成功后主动同步一次会话（不依赖事件到达顺序） */
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<CloudSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const { data, error: sessionError } = await cloud.auth.getSession()
    if (sessionError) {
      // 瞬时网络错误不清空已有会话（SDK 规范：transient error 保留当前会话）
      setError(toUserMessage(sessionError))
      if (session) {
        setStatus('signedIn')
      } else {
        setStatus('signedOut')
      }
      return
    }
    setError(null)
    setSession(data ?? null)
    setStatus(data ? 'signedIn' : 'signedOut')
  }, [session])

  useEffect(() => {
    let active = true

    // onAuthStateChange 会立即回放一次 INITIAL_SESSION；这里忽略它，
    // 由 getSession() 统一决定初始状态，避免两次写入造成首屏闪烁。
    const unsubscribe = cloud.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event === 'INITIAL_SESSION') return
      setSession(nextSession)
      setStatus(nextSession ? 'signedIn' : 'signedOut')
      setError(null)
    })

    void (async () => {
      const { data, error: sessionError } = await cloud.auth.getSession()
      if (!active) return
      if (sessionError) {
        setError(toUserMessage(sessionError))
        setSession(null)
        setStatus('signedOut')
        return
      }
      setSession(data ?? null)
      setStatus(data ? 'signedIn' : 'signedOut')
    })()

    return () => {
      active = false
      unsubscribe()
    }
    // 只在挂载时初始化；后续变化由 onAuthStateChange 与 refresh() 驱动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = useCallback(async () => {
    const { error: signOutError } = await cloud.auth.signOut()
    // signOut 无论服务端成败都会清本地，这里跟随本地状态即可。
    setSession(null)
    setStatus('signedOut')
    setError(signOutError ? toUserMessage(signOutError) : null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      error,
      refresh,
      signOut,
    }),
    [status, session, error, refresh, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return context
}
