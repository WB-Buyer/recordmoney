import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import AddPage from './pages/AddPage'
import StatsPage from './pages/StatsPage'
import SavingsPage from './pages/SavingsPage'
import SettingsPage from './pages/SettingsPage'
import CreditCardSummaryPage from './pages/CreditCardSummaryPage'
import { supabase } from './lib/supabase'
import { pullFromSupabase, pushUnsyncedToSupabase, setSessionExpiry } from './lib/localDB'
import type { User } from '@supabase/supabase-js'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    // 先從 localStorage 恢復既有 session，完成後才解除 loading
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        console.log('[Auth] 已有 session：', session.user.id)
        setUser(session.user)
      }
      setLoading(false)  // 唯一解除 loading 的地方，確保 session 已確認
    })

    // 監聽後續登入/登出狀態變化（不再負責解除 loading）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (event === 'SIGNED_IN' && session) {
          console.log('[Auth] 登入成功：', session.user.email)
          setSessionExpiry()
          // 先推送本地未同步的資料
          await pushUnsyncedToSupabase()
          // 再從雲端拉取最新資料
          await pullFromSupabase()
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        height: '100dvh', background: '#F5F0E8', gap: 14,
      }}>
        <div style={{ fontSize: 40 }}>🧋</div>
        <div style={{ fontSize: 14, color: '#9E9087', fontWeight: 500 }}>載入中...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index          element={<HomePage />} />
          <Route path="add"     element={<AddPage />} />
          <Route path="stats"   element={<StatsPage />} />
          <Route path="savings" element={<SavingsPage />} />
          <Route path="settings"             element={<SettingsPage />} />
          <Route path="credit-card-summary" element={<CreditCardSummaryPage />} />
          <Route path="*"                   element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
