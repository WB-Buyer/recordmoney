// 消費明細頁面 — 已整合至 AddPage 的「消費明細」Tab
// 此元件保留作為獨立引用用途

import { useNavigate } from 'react-router-dom'

export default function RecordsPage() {
  const navigate = useNavigate()

  // 重定向到 AddPage 的消費明細 tab
  navigate('/add?tab=records', { replace: true })
  return null
}
