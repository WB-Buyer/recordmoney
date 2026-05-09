import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CATEGORY_EMOJI } from '../lib/supabase'

interface CardSummary {
  card_id: string
  card_name: string
  due_day: number
  total: number
  byCategory: { category: string; total: number }[]
}

function daysUntil(dueDay: number): number {
  const now = new Date()
  const due = new Date(now.getFullYear(), now.getMonth(), dueDay)
  if (due < now) due.setMonth(due.getMonth() + 1)
  return Math.ceil((due.getTime() - now.getTime()) / 86400000)
}

export default function CreditCardSummaryPage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summaries, setSummaries] = useState<CardSummary[]>([])
  const [loading, setLoading]     = useState(false)

  async function loadAndSet() {
    setLoading(true)
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data: cards } = await supabase.from('credit_cards').select('id, card_name, due_day')
      const { data: txs }   = await supabase
        .from('transactions')
        .select('amount, category_id, credit_card_id')
        .eq('payment_method', 'credit_card')
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate)

      const { data: cats } = await supabase.from('categories').select('id, name')
      const catMap: Record<string, string> = {}
      ;(cats ?? []).forEach((c: { id: string; name: string }) => { catMap[c.id] = c.name })

      const result: CardSummary[] = (cards ?? []).map((card: { id: string; card_name: string; due_day: number }) => {
        const cardTxs = (txs ?? []).filter((t: { credit_card_id: string | null }) => t.credit_card_id === card.id)
        const total = cardTxs.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
        const catTotals: Record<string, number> = {}
        cardTxs.forEach((t: { category_id: string | null; amount: number }) => {
          const name = t.category_id ? (catMap[t.category_id] ?? '其他') : '其他'
          catTotals[name] = (catTotals[name] ?? 0) + t.amount
        })
        const byCategory = Object.entries(catTotals)
          .map(([category, total]) => ({ category, total }))
          .sort((a, b) => b.total - a.total)
        return { card_id: card.id, card_name: card.card_name, due_day: card.due_day, total, byCategory }
      }).filter((s: CardSummary) => s.total > 0)

      setSummaries(result)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAndSet()
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }
  const atLatest = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="page-title">
        <span>信用卡明細總覽</span>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 月份選擇器 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <button
            onClick={prevMonth}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B5E52', padding: 4 }}
          >
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>
            {year} 年 {month} 月
          </span>
          <button
            onClick={nextMonth}
            disabled={atLatest}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: atLatest ? '#DDD5C8' : '#6B5E52', padding: 4 }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', color: '#9E9087', padding: 24, fontSize: 13 }}>載入中...</div>
        )}

        {!loading && summaries.length === 0 && (
          <div style={{
            background: '#F0EAE0', borderRadius: 12, padding: '32px 14px',
            textAlign: 'center', border: '1px solid rgba(180,160,130,0.3)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
            <div style={{ fontSize: 13, color: '#9E9087' }}>本月沒有信用卡消費記錄</div>
          </div>
        )}

        {summaries.map(s => {
          const days = daysUntil(s.due_day)
          return (
            <div key={s.card_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* 卡片標題 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '12px 14px', background: 'rgba(221,213,200,0.3)',
                borderBottom: '1px solid rgba(180,160,130,0.15)',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2C2820' }}>💳 {s.card_name}</div>
                  <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2 }}>
                    繳款日 {s.due_day} 日・
                    <span style={{ color: days <= 5 ? '#C0554A' : days <= 10 ? '#E6A817' : '#5E9B6A', fontWeight: 600 }}>
                      還有 {days} 天
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#9E9087' }}>本月應繳</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#C0554A' }}>
                    ${s.total.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* 分類明細 */}
              <div style={{ padding: '8px 0' }}>
                {s.byCategory.map(bc => (
                  <div
                    key={bc.category}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 14px',
                    }}
                  >
                    <span style={{ fontSize: 13, color: '#2C2820' }}>
                      {(CATEGORY_EMOJI as Record<string, string>)[bc.category] ?? '📦'} {bc.category}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#C0554A' }}>
                      ${bc.total.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
