import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { restoreAuth } from './auth/restoreAuth'
import { queryClient } from './lib/queryClient'
import './index.css'

/**
 * OAuth 回调必须在任何路由门禁之前处理完，否则单次的 code 会被门禁跳转丢掉。
 * 普通访问时 restoreAuth() 直接返回 null，由 AuthProvider 恢复本地会话。
 */
async function bootstrap() {
  const notice = await restoreAuth()
  const container = document.getElementById('root')
  if (!container) throw new Error('缺少 #root 挂载点')

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App startupNotice={notice} />
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
