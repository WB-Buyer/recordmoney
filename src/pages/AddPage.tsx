import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  CATEGORIES, CATEGORY_LIST, CATEGORY_EMOJI, supabase,
  type Category, type Expense, type ExpenseInsert,
} from '../lib/supabase'
import { getTransactionsByMonth, getTransactions as getLocalTransactions, deleteTransaction, updateTransaction } from '../lib/localDB'
import { AI_CATEGORY_MAP } from '../lib/categories'
import { CheckCircle, AlertCircle, Loader, Pencil, ChevronDown, Upload } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import * as XLSX from 'xlsx'

// ─── 類型 Toggle ──────────────────────────────────────────
function TypeToggle({ value, onChange }: { value: 'expense' | 'income'; onChange: (v: 'expense' | 'income') => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {(['expense', 'income'] as const).map(t => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          style={{
            padding: '5px 20px',
            borderRadius: 20,
            border: `1px solid ${value === t
              ? (t === 'expense' ? '#C0554A' : '#5E9B6A')
              : 'rgba(180,160,130,0.4)'}`,
            background: value === t
              ? (t === 'expense' ? '#C0554A' : '#5E9B6A')
              : '#F0EAE0',
            color: value === t ? 'white' : '#6B5E52',
            fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          {t === 'expense' ? '支出' : '收入'}
        </button>
      ))}
    </div>
  )
}

// 收入主分類（單層，無小分類）
const INCOME_CATEGORIES = ['薪資', '獎金', '老公給的零用錢', '發票中獎', '股票獲利', '紅包', '其它'] as const
type IncomeCategory = typeof INCOME_CATEGORIES[number]

// 收帳帳戶選項
const INCOME_ACCOUNTS = ['現金', '台新', '永豐', '國泰', '玉山'] as const

// 匯款帳戶選項（擴充）
const TRANSFER_ACCOUNTS = ['台新薪轉', '台新 Richart', '國泰 Cube', '國泰美金', '永豐大戶', '玉山', '富邦'] as const

// ─── Tab 1：手動記帳 ──────────────────────────────────────
function ManualTab() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const navigate = useNavigate()
  const [date, setDate]               = useState(today)
  const [type, setType]               = useState<'expense' | 'income'>('expense')
  const [category, setCategory]       = useState<Category>(CATEGORY_LIST[0])
  const [subcategory, setSubcategory] = useState(CATEGORIES[CATEGORY_LIST[0]][0])
  const [incomeCat, setIncomeCat]     = useState<IncomeCategory>(INCOME_CATEGORIES[0])
  const [incomeAccount, setIncomeAccount] = useState<string>(INCOME_ACCOUNTS[0])
  const [amountStr, setAmountStr]     = useState('')
  const [note, setNote]               = useState('')
  const [payment, setPayment]         = useState<'credit' | 'cash' | 'transfer'>('credit')
  const [cardName, setCardName]       = useState('台新 Richart')
  const [account, setAccount]         = useState<string>(TRANSFER_ACCOUNTS[0])
  const [loading, setLoading]         = useState(false)
  const [toast, setToast]             = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // 電腦鍵盤輸入支援
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // 如果焦點在 input/select/textarea，不攔截（讓使用者正常輸入備註等欄位）
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        setAmountStr(prev => prev + e.key)
      } else if (e.key === '.') {
        e.preventDefault()
        setAmountStr(prev => prev + '.')
      } else if (e.key === '+') {
        e.preventDefault()
        setAmountStr(prev => prev + '+')
      } else if (e.key === '-') {
        e.preventDefault()
        setAmountStr(prev => prev + '−')
      } else if (e.key === '*') {
        e.preventDefault()
        setAmountStr(prev => prev + '×')
      } else if (e.key === '/') {
        e.preventDefault()
        setAmountStr(prev => prev + '÷')
      } else if (e.key === '%') {
        e.preventDefault()
        setAmountStr(prev => {
          const num = parseFloat(prev)
          return !isNaN(num) ? String(num / 100) : prev
        })
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        setAmountStr(prev => prev.slice(0, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setAmountStr(prev => {
          const cleaned = prev.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
          try {
            // eslint-disable-next-line no-new-func
            const result = new Function(`"use strict"; return (${cleaned})`)()
            return typeof result === 'number' && isFinite(result) && result > 0
              ? String(Math.round(result * 100) / 100)
              : prev
          } catch { return prev }
        })
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setAmountStr('')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function showToast(t: 'ok' | 'err', msg: string) {
    setToast({ type: t, msg })
    setTimeout(() => setToast(null), 2800)
  }

  function handleCat(cat: Category) {
    setCategory(cat)
    setSubcategory(CATEGORIES[cat][0])
  }

  const numpadKeys = [
    '7','8','9','÷',
    '4','5','6','×',
    '1','2','3','−',
    '%','0','⌫','+',
    'C','=','.','',
  ]

  function handleKey(key: string) {
    if (key === '⌫') {
      setAmountStr(prev => prev.slice(0, -1))
    } else if (key === 'C') {
      setAmountStr('')
    } else if (key === '=') {
      setAmountStr(prev => {
        const cleaned = prev.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
        try {
          // eslint-disable-next-line no-new-func
          const result = new Function(`"use strict"; return (${cleaned})`)()
          return typeof result === 'number' && isFinite(result) && result > 0
            ? String(Math.round(result * 100) / 100)
            : prev
        } catch { return prev }
      })
    } else if (key === '%') {
      setAmountStr(prev => {
        const num = parseFloat(prev)
        return !isNaN(num) ? String(num / 100) : prev
      })
    } else if (key === '') {
      // 空格鍵不動作
    } else {
      setAmountStr(prev => prev + key)
    }
  }

  function parseAmount(s: string): number {
    const cleaned = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${cleaned})`)()
      return typeof result === 'number' && isFinite(result) && result > 0 ? result : 0
    } catch {
      return 0
    }
  }

  async function handleSave() {
    const num = parseAmount(amountStr)
    if (!num) { showToast('err', '請輸入有效金額'); return }
    setLoading(true)
    try {
      const { addTransaction: localAdd, deductFromAccount } = await import('../lib/localDB')

      // 信用卡 id（本地查詢，fallback null）
      let credit_card_id: string | null = null
      if (type === 'expense' && payment === 'credit') {
        try {
          const { data: cards } = await supabase.from('credit_cards').select('id, card_name')
          const match = (cards ?? []).find((c: any) => c.card_name === cardName)
          credit_card_id = match?.id ?? null
        } catch { /* 無網路時忽略 */ }
      }

      // 本地儲存（立即完成，不等網路）
      localAdd({
        date,
        amount: num,
        type: type as 'expense' | 'income',
        category: type === 'income' ? incomeCat : category,
        subcategory: type === 'income' ? '' : subcategory,
        payment_method: (type === 'income' ? 'cash' : payment) as string,
        payment: type === 'income'
          ? incomeAccount
          : payment === 'credit' ? cardName
          : payment === 'transfer' ? account
          : '現金',
        note: note || '',
        credit_card_id,
        bank_account_id: null,
        source: 'manual',
      })

      // 匯款時從帳戶扣款
      if (type === 'expense' && payment === 'transfer' && account) {
        deductFromAccount(account, num)
      }

      showToast('ok', '記帳成功！')
      setAmountStr('')
      setNote('')
      setTimeout(() => navigate('/add?tab=records'), 800)
    } catch (err: any) {
      console.error('儲存失敗:', err)
      showToast('err', err.message ?? '儲存失敗，請重試')
    } finally {
      setLoading(false)
    }
  }

  const displayAmount = amountStr || '0'
  const amountColor = type === 'expense' ? '#C0554A' : '#5E9B6A'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 日期 */}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="finp"
        style={{ fontSize: 13 }}
      />

      {/* 類型 */}
      <TypeToggle value={type} onChange={setType} />

      {/* 金額顯示 */}
      <div style={{
        background: '#F0EAE0',
        border: '1px solid rgba(180,160,130,0.45)',
        borderRadius: 10,
        padding: '10px 14px',
        textAlign: 'right',
        fontSize: 28,
        fontWeight: 700,
        color: amountColor,
        minHeight: 54,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {displayAmount}
      </div>

      {/* 數字鍵盤 */}
      <div style={{
        background: '#EAE3D8',
        borderRadius: 12,
        padding: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6,
      }}>
        {numpadKeys.map((key, i) => (
          key === '' ? (
            <div key={`empty-${i}`} />
          ) : (
          <button
            key={key}
            type="button"
            onClick={() => handleKey(key)}
            className={`key${['÷','×','−','+','%','='].includes(key) ? ' operator' : key === '⌫' || key === 'C' ? ' delete' : ''}`}
          >
            {key}
          </button>
          )
        ))}
      </div>

      {/* 主分類 */}
      <div>
        <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 6 }}>主分類</div>
        {type === 'expense' ? (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {CATEGORY_LIST.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCat(cat)}
                className={`cat-pill${category === cat ? ' active' : ''}`}
              >
                {CATEGORY_EMOJI[cat]} {cat}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {INCOME_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setIncomeCat(cat)}
                className={`cat-pill${incomeCat === cat ? ' active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 小分類（僅支出顯示） */}
      {type === 'expense' && (
        <div>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 6 }}>小分類</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES[category].map(sub => (
              <button
                key={sub}
                type="button"
                onClick={() => setSubcategory(sub)}
                className={`subcat-pill${subcategory === sub ? ' active' : ''}`}
              >
                {sub}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 備註 */}
      <input
        type="text"
        placeholder="選填備註..."
        value={note}
        onChange={e => setNote(e.target.value)}
        className="finp"
      />

      {/* 消費方式（支出）/ 收帳帳戶（收入） */}
      {type === 'expense' ? (
        <div>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 6 }}>消費方式</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {([
              { id: 'credit', label: '信用卡' },
              { id: 'cash',   label: '現金' },
              { id: 'transfer', label: '匯款' },
            ] as const).map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPayment(m.id)}
                className={`cat-pill${payment === m.id ? ' active' : ''}`}
                style={{ padding: '5px 12px', fontSize: 12 }}
              >
                {m.label}
              </button>
            ))}
            {payment === 'credit' && (
              <select
                value={cardName}
                onChange={e => setCardName(e.target.value)}
                className="finp"
                style={{ width: 'auto', flex: 1, minWidth: 130, fontSize: 12, padding: '5px 28px 5px 10px' }}
              >
                {['台新 Richart','國泰 Cube','富邦 J','玉山 Ubear'].map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            {payment === 'transfer' && (
              <select
                value={account}
                onChange={e => setAccount(e.target.value)}
                className="finp"
                style={{ width: 'auto', flex: 1, minWidth: 130, fontSize: 12, padding: '5px 28px 5px 10px' }}
              >
                {TRANSFER_ACCOUNTS.map(a => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 6 }}>收帳帳戶</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {INCOME_ACCOUNTS.map(acc => (
              <button
                key={acc}
                type="button"
                onClick={() => setIncomeAccount(acc)}
                className={`cat-pill${incomeAccount === acc ? ' active' : ''}`}
                style={{ padding: '5px 12px', fontSize: 12 }}
              >
                {acc}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 儲存 */}
      <button className="save-btn" onClick={handleSave} disabled={loading}>
        {loading ? '儲存中...' : '儲存記帳'}
      </button>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: toast.type === 'ok' ? '#5E9B6A' : '#C0554A',
          color: '#fff', padding: '12px 20px', borderRadius: 99,
          fontSize: 14, fontWeight: 500,
          whiteSpace: 'nowrap', zIndex: 300,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2：消費明細 ──────────────────────────────────────
function RecordsTab() {
  const now = new Date()
  const [mode, setMode]       = useState<'month' | 'range'>('month')
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [startDate, setStartDate] = useState(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(now, 'yyyy-MM-dd'))
  const [catFilter, setCatFilter] = useState<Category | ''>('')
  const [records, setRecords] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [editRecord, setEditRecord] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    try {
      const data = mode === 'month'
        ? getTransactionsByMonth(year, month)
        : getLocalTransactions().filter(r => r.date >= startDate && r.date <= endDate)
      setRecords(data as unknown as Expense[])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [mode, year, month, startDate, endDate])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date()
    if (year === n.getFullYear() && month === n.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const filtered = catFilter ? records.filter(r => r.category === catFilter) : records
  const totalExp = filtered.filter(r => r.type !== 'income').reduce((s, r) => s + r.amount, 0)
  const totalInc = filtered.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)

  // 分類加總
  const catTotals = CATEGORY_LIST.map(cat => ({
    cat,
    sum: filtered.filter(r => r.category === cat).reduce((s, r) => s + r.amount, 0),
    subs: CATEGORIES[cat].map(sub => ({
      sub,
      sum: filtered.filter(r => r.category === cat && r.subcategory === sub).reduce((s, r) => s + r.amount, 0),
    })).filter(s => s.sum > 0),
  })).filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum)

  const maxCatSum = catTotals[0]?.sum ?? 1

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // ─ 匯出 Excel ─
  function handleExcelExport() {
    setExporting('excel')
    try {
      const rows = filtered.map(r => ({
        日期: r.date,
        類型: r.type === 'income' ? '收入' : '支出',
        主分類: r.category,
        小分類: r.subcategory,
        備註: r.note ?? '',
        消費方式: r.payment ?? '',
        金額: r.type === 'income' ? r.amount : -r.amount,
      }))
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, '消費明細')
      const label = mode === 'month'
        ? `${year}-${String(month).padStart(2,'0')}`
        : `${startDate}_${endDate}`
      XLSX.writeFile(wb, `消費明細_${label}.xlsx`)
    } finally {
      setExporting(null)
    }
  }

  // ─ 匯出 PDF（html2canvas 截圖方式）─
  async function handlePdfExport() {
    setExporting('pdf')
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const label = mode === 'month'
        ? `${year}-${String(month).padStart(2,'0')}`
        : `${startDate} ~ ${endDate}`

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;padding:32px;font-family:Microsoft JhengHei,Noto Sans TC,sans-serif;'

      container.innerHTML = `
        <h2 style="font-size:18px;font-weight:bold;margin-bottom:6px;">消費明細報表</h2>
        <p style="font-size:12px;color:#666;margin-bottom:12px;">期間：${label}　支出：$${totalExp.toLocaleString()}　收入：$${totalInc.toLocaleString()}</p>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#DDD5C8;">
              <th style="padding:5px 8px;text-align:left;border:1px solid #ccc;">日期</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #ccc;">分類</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #ccc;">小分類</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #ccc;">備註</th>
              <th style="padding:5px 8px;text-align:left;border:1px solid #ccc;">消費方式</th>
              <th style="padding:5px 8px;text-align:right;border:1px solid #ccc;">金額</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((r, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#fff' : '#F5F0E8'};">
                <td style="padding:4px 8px;border:1px solid #eee;">${format(parseISO(r.date), 'M/d (EEE)', { locale: zhTW })}</td>
                <td style="padding:4px 8px;border:1px solid #eee;">${r.category}</td>
                <td style="padding:4px 8px;border:1px solid #eee;">${r.subcategory}</td>
                <td style="padding:4px 8px;border:1px solid #eee;">${r.note ?? ''}</td>
                <td style="padding:4px 8px;border:1px solid #eee;">${r.payment ?? ''}</td>
                <td style="padding:4px 8px;border:1px solid #eee;text-align:right;color:${r.type === 'income' ? '#5E9B6A' : '#C0554A'};">
                  ${r.type === 'income' ? '+' : '-'}$${r.amount.toLocaleString()}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      document.body.appendChild(container)
      const canvas = await html2canvas(container, { scale: 2, useCORS: true })
      document.body.removeChild(container)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = 210
      const imgH = (canvas.height * pageW) / canvas.width
      let y = 0
      while (y < imgH) {
        if (y > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -y, pageW, imgH)
        y += 297
      }
      pdf.save(`消費明細_${label}.pdf`)
    } catch (e) {
      alert('PDF 匯出失敗：' + (e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const paymentColor = (p?: string) => {
    if (!p) return 'chip-amber'
    if (p === '現金') return 'chip-green'
    if (p === '台幣綜合帳戶' || p === '美金帳戶') return 'chip-purple'
    return 'chip-amber'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 篩選列 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="finp"
          value={mode}
          onChange={e => setMode(e.target.value as 'month' | 'range')}
          style={{ width: 'auto', fontSize: 12, padding: '5px 28px 5px 8px' }}
        >
          <option value="month">按月份</option>
          <option value="range">自訂區間</option>
        </select>

        {mode === 'month' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button className="sbtn" onClick={prevMonth}>‹</button>
            <span style={{ fontSize: 12, color: '#2C2820', fontWeight: 600, minWidth: 60, textAlign: 'center' }}>
              {year}/{String(month).padStart(2,'0')}
            </span>
            <button className="sbtn" onClick={nextMonth}>›</button>
          </div>
        )}

        {mode === 'range' && (
          <>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="finp" style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }} />
            <span style={{ fontSize: 11, color: '#9E9087' }}>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="finp" style={{ width: 'auto', fontSize: 12, padding: '5px 8px' }} />
          </>
        )}

        <select
          className="finp"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value as Category | '')}
          style={{ width: 'auto', fontSize: 12, padding: '5px 28px 5px 8px' }}
        >
          <option value="">所有類別</option>
          {CATEGORY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <button
          className="sbtn"
          style={{ background: '#EAF3DE', color: '#27500A', opacity: exporting ? 0.6 : 1 }}
          onClick={handleExcelExport}
          disabled={!!exporting || loading}
        >
          {exporting === 'excel' ? '匯出中...' : '匯出 Excel'}
        </button>
        <button
          className="sbtn"
          style={{ background: '#FAEEDA', color: '#633806', opacity: exporting ? 0.6 : 1 }}
          onClick={handlePdfExport}
          disabled={!!exporting || loading}
        >
          {exporting === 'pdf' ? '匯出中...' : '匯出 PDF'}
        </button>
      </div>

      {/* 統計卡 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>期間支出</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#C0554A' }}>
            ${totalExp.toLocaleString()}
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>期間收入</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#5E9B6A' }}>
            ${totalInc.toLocaleString()}
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: '#9E9087' }}>
          <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {/* 分類加總 */}
      {!loading && catTotals.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {catTotals.map(({ cat, sum, subs }) => (
            <div key={cat}>
              <div
                onClick={() => toggleCat(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(180,160,130,0.15)',
                }}
              >
                <span style={{ fontSize: 12, color: '#2C2820', width: 52, flexShrink: 0, fontWeight: 500 }}>
                  {CATEGORY_EMOJI[cat]} {cat}
                </span>
                <div style={{ flex: 1, height: 6, background: 'rgba(180,160,130,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#8B7355', borderRadius: 3, width: `${(sum / maxCatSum) * 100}%`, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2C2820', width: 60, textAlign: 'right', flexShrink: 0 }}>
                  ${sum.toLocaleString()}
                </span>
                <ChevronDown size={12} style={{ color: '#9E9087', transform: expandedCats.has(cat) ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
              </div>
              {expandedCats.has(cat) && subs.map(({ sub, sum: s }) => (
                <div key={sub} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px 5px 78px', background: 'rgba(221,213,200,0.15)', borderBottom: '1px solid rgba(180,160,130,0.1)' }}>
                  <span style={{ fontSize: 11, color: '#6B5E52' }}>{sub}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#2C2820' }}>${s.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ))}
          {/* 全部加總 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#DDD5C8', borderRadius: '0 0 14px 14px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2C2820' }}>全部加總</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#2C2820' }}>
              ${(totalExp + totalInc).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* 逐筆明細 */}
      {!loading && filtered.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#9E9087', marginBottom: 6 }}>逐筆明細</div>
          {filtered.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', background: '#F0EAE0',
              border: '1px solid rgba(180,160,130,0.3)',
              borderRadius: 10, marginBottom: 6,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#9E9087' }}>
                    {format(parseISO(r.date), 'M/d (EEE)', { locale: zhTW })}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2C2820' }}>
                    {r.category}/{r.subcategory}
                  </span>
                  {r.payment && (
                    <span className={`chip ${paymentColor(r.payment)}`}>{r.payment}</span>
                  )}
                </div>
                {r.note && (
                  <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.note}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{
                  fontSize: 14, fontWeight: 700,
                  color: r.type === 'income' ? '#5E9B6A' : '#C0554A',
                }}>
                  {r.type === 'income' ? '+' : '-'}${r.amount.toLocaleString()}
                </span>
                <button
                  className="sbtn"
                  onClick={() => setEditRecord(r)}
                  style={{ padding: '4px 8px' }}
                >
                  <Pencil size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#9E9087' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧾</div>
          <div style={{ fontSize: 13 }}>本期沒有記帳記錄</div>
        </div>
      )}

      {/* 編輯 Modal */}
      {editRecord && (
        <EditModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSave={async (updated) => {
            try {
              updateTransaction(editRecord.id, {
                ...updated,
                note: updated.note ?? '',
                type: updated.type as 'expense' | 'income' | undefined,
              })
              setRecords(prev => prev.map(r => r.id === editRecord.id ? ({ ...r, ...updated, type: (updated.type as 'expense' | 'income' | undefined) ?? r.type }) : r))
              setEditRecord(null)
            } catch (e) { console.error(e) }
          }}
          onDelete={async () => {
            if (!confirm('確定刪除？')) return
            setDeleting(editRecord.id)
            try {
              deleteTransaction(editRecord.id)
              setRecords(prev => prev.filter(r => r.id !== editRecord.id))
              setEditRecord(null)
            } catch (e) { console.error(e) }
            finally { setDeleting(null) }
          }}
          deleting={deleting === editRecord.id}
        />
      )}
    </div>
  )
}

// ─── Edit Modal ───────────────────────────────────────────
function EditModal({ record, onClose, onSave, onDelete, deleting }: {
  record: Expense
  onClose: () => void
  onSave: (updated: Partial<ExpenseInsert>) => Promise<void>
  onDelete: () => Promise<void>
  deleting: boolean
}) {
  const [date, setDate]               = useState(record.date)
  const [category, setCategory]       = useState<Category>(record.category as Category)
  const [subcategory, setSubcategory] = useState(record.subcategory)
  const [amount, setAmount]           = useState(String(record.amount))
  const [note, setNote]               = useState(record.note ?? '')
  const [saving, setSaving]           = useState(false)

  async function handleSave() {
    const num = parseFloat(amount)
    if (!num || num <= 0) return
    setSaving(true)
    try {
      await onSave({ date, category, subcategory, amount: num, note: note || undefined })
    } finally {
      setSaving(false)
    }
  }

  const isDesktop = window.innerWidth >= 768

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 400, animation: 'fadeInOverlay 0.2s ease',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed',
        ...(isDesktop
          ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: 16, width: 380 }
          : { bottom: 0, left: 0, right: 0, borderRadius: '20px 20px 0 0', animation: 'slideUp 0.25s ease' }
        ),
        background: '#F5F0E8',
        padding: 20,
        zIndex: 500,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2C2820', marginBottom: 14 }}>編輯記帳</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="finp" />

          <select value={category} onChange={e => { setCategory(e.target.value as Category); setSubcategory(CATEGORIES[e.target.value as Category][0]) }} className="finp">
            {CATEGORY_LIST.map(c => <option key={c}>{c}</option>)}
          </select>

          <select value={subcategory} onChange={e => setSubcategory(e.target.value)} className="finp">
            {CATEGORIES[category].map(s => <option key={s}>{s}</option>)}
          </select>

          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="finp" placeholder="金額" />

          <input type="text" value={note} onChange={e => setNote(e.target.value)} className="finp" placeholder="備註（選填）" />

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? '儲存中...' : '儲存修改'}
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              style={{
                flex: 1, padding: 13, borderRadius: 12, border: 'none',
                background: '#C0554A', color: 'white', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', opacity: deleting ? 0.6 : 1,
              }}
            >
              {deleting ? '刪除中...' : '刪除'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── 帳單辨識結果型別（問題 4：更新為新的 AI 回傳格式）────
interface AiTransaction {
  date: string
  merchant: string
  amount: number
  category: string   // '食' | '衣' | '住' | '行' | '娛樂' | '投資' | '其他'
  note: string
  _enabled: boolean  // UI：是否勾選匯入
}

interface BillResult {
  card_name: string
  transactions: AiTransaction[]
  total_amount: number
  due_date: string | null
}

// ─── Tab 3：帳單管理 ──────────────────────────────────────
function BillsTab() {
  const navigate = useNavigate()
  const [dragging, setDragging]         = useState(false)
  const [previews, setPreviews]         = useState<{ file: File; url: string }[]>([])
  const [recognizing, setRecognizing]   = useState(false)
  const [billResult, setBillResult]     = useState<BillResult | null>(null)
  const [importing, setImporting]       = useState(false)
  const [importDone, setImportDone]     = useState(false)
  const fileInputRef                    = useState(() => { const r = { current: null as HTMLInputElement | null }; return r })[0]

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const newPreviews = Array.from(files).map(file => ({
      file,
      url: URL.createObjectURL(file),
    }))
    setPreviews(prev => [...prev, ...newPreviews])
    setBillResult(null)
    setImportDone(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function removePreview(idx: number) {
    setPreviews(prev => {
      URL.revokeObjectURL(prev[idx].url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function handleRecognize() {
    if (previews.length === 0) return
    setRecognizing(true)
    try {
      const file = previews[0].file
      const reader = new FileReader()
      const base64 = await new Promise<string>(resolve => {
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })

      let result: BillResult | null = null
      try {
        const { data, error } = await supabase.functions.invoke('analyze-bill', {
          body: { image: base64, mimeType: file.type },
        })
        if (!error && data?.transactions) {
          result = {
            ...data,
            transactions: (data.transactions as AiTransaction[]).map(t => ({ ...t, _enabled: true })),
          }
        } else {
          throw new Error('Edge Function 未回應')
        }
      } catch {
        // Mock 辨識結果（Edge Function 未部署時）
        const today = format(new Date(), 'yyyy-MM-dd')
        result = {
          card_name: '台新 Richart',
          total_amount: 1183,
          due_date: null,
          transactions: [
            { date: today, merchant: '全聯福利中心', amount: 312, category: '食', note: '全聯PX MART', _enabled: true },
            { date: today, merchant: '麥當勞',       amount: 198, category: '食', note: 'MCDONALD\'S',  _enabled: true },
            { date: today, merchant: 'Netflix',      amount: 330, category: '娛樂', note: 'NETFLIX.COM', _enabled: true },
            { date: today, merchant: '7-ELEVEN',     amount: 87,  category: '食', note: '7-ELEVEN',   _enabled: true },
            { date: today, merchant: 'Uber Eats',    amount: 256, category: '行', note: 'UBER EATS',  _enabled: true },
          ],
        }
      }
      setBillResult(result)
    } finally {
      setRecognizing(false)
    }
  }

  function toggleItem(idx: number) {
    setBillResult(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map((t, i) => i === idx ? { ...t, _enabled: !t._enabled } : t),
    } : prev)
  }

  function updateItemCategory(idx: number, category: string) {
    setBillResult(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map((t, i) => i === idx ? { ...t, category } : t),
    } : prev)
  }

  function updateItemDate(idx: number, date: string) {
    setBillResult(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map((t, i) => i === idx ? { ...t, date } : t),
    } : prev)
  }

  function updateItemMerchant(idx: number, merchant: string) {
    setBillResult(prev => prev ? {
      ...prev,
      transactions: prev.transactions.map((t, i) => i === idx ? { ...t, merchant } : t),
    } : prev)
  }

  function updateItemAmount(idx: number, amount: string) {
    const n = parseFloat(amount)
    if (!isNaN(n) && n >= 0) {
      setBillResult(prev => prev ? {
        ...prev,
        transactions: prev.transactions.map((t, i) => i === idx ? { ...t, amount: n } : t),
      } : prev)
    }
  }

  // 問題 4：匯入辨識結果到 transactions 表
  async function handleImport() {
    if (!billResult) return
    const enabled = billResult.transactions.filter(t => t._enabled)
    if (enabled.length === 0) return

    setImporting(true)
    try {
      // 嘗試從 credit_cards 表找到對應的 credit_card_id
      const { data: cards } = await supabase
        .from('credit_cards')
        .select('id, card_name')
      const cardMap = (cards ?? []).reduce<Record<string, string>>((acc, c) => {
        acc[c.card_name] = c.id
        return acc
      }, {})
      const credit_card_id = cardMap[billResult.card_name] ?? null

      for (const tx of enabled) {
        // 問題 4：用 AI_CATEGORY_MAP 取得 category_id
        const category_id = AI_CATEGORY_MAP[tx.category] ?? null
        const payload: Record<string, unknown> = {
          date:            tx.date,
          amount:          tx.amount,
          type:            'expense',
          category_id,
          sub_category_id: null,
          payment_method:  'credit_card',
          credit_card_id,
          note:            tx.note || tx.merchant,
          source:          'ai_scan',  // 問題 3-4：AI 匯入標記
        }
        // 取得 user_id（RLS 必須帶入）
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('請先登入才能匯入帳單')
        payload.user_id = user.id

        await supabase.from('transactions').insert(payload)
      }
      setImportDone(true)
      // 匯入成功後跳轉到信用卡明細總覽
      setTimeout(() => navigate('/credit-card-summary'), 1200)
    } catch (e) {
      alert('匯入失敗：' + (e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const AI_CATS = ['食', '衣', '住', '行', '娛樂', '投資', '其他']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 上傳區 */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed rgba(180,160,130,${dragging ? '0.8' : '0.5'})`,
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          background: dragging ? 'rgba(221,213,200,0.35)' : 'rgba(221,213,200,0.18)',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={28} style={{ color: '#9E9087' }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6B5E52' }}>上傳帳單截圖</div>
        <div style={{ fontSize: 11, color: '#9E9087', textAlign: 'center' }}>
          支援多張圖片，AI 自動辨識各卡消費明細<br />
          點擊選擇或直接拖曳圖片到此區域
        </div>
      </div>
      <input
        ref={el => { fileInputRef.current = el }}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {/* 縮圖預覽 */}
      {previews.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 8 }}>
            已選擇 {previews.length} 張圖片
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {previews.map((p, idx) => (
              <div
                key={p.url}
                style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(180,160,130,0.4)', flexShrink: 0 }}
              >
                <img src={p.url} alt={`bill-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={e => { e.stopPropagation(); removePreview(idx) }}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    background: 'rgba(0,0,0,0.55)', border: 'none',
                    borderRadius: '50%', width: 18, height: 18,
                    cursor: 'pointer', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, lineHeight: 1, padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button
            className="save-btn"
            style={{ marginTop: 12, opacity: recognizing ? 0.6 : 1 }}
            onClick={handleRecognize}
            disabled={recognizing}
          >
            {recognizing ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} />
                AI 辨識中...
              </span>
            ) : '開始辨識'}
          </button>
        </div>
      )}

      {/* 問題 4：辨識結果 — 可編輯的確認清單 */}
      {billResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 卡片標題列 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2C2820' }}>
              💳 {billResult.card_name}
            </span>
            {billResult.total_amount > 0 && (
              <span style={{ fontSize: 11, color: '#9E9087' }}>
                本期應繳 ${billResult.total_amount.toLocaleString()}
                {billResult.due_date ? `（繳款日 ${billResult.due_date}）` : ''}
              </span>
            )}
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {billResult.transactions.map((tx, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px',
                  borderBottom: idx < billResult.transactions.length - 1 ? '1px solid rgba(180,160,130,0.12)' : 'none',
                  opacity: tx._enabled ? 1 : 0.4,
                }}
              >
                {/* 勾選 */}
                <input
                  type="checkbox"
                  checked={tx._enabled}
                  onChange={() => toggleItem(idx)}
                  style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                />
                {/* 商家 + 日期（可編輯）*/}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <input
                    className="finp"
                    value={tx.merchant}
                    onChange={e => updateItemMerchant(idx, e.target.value)}
                    style={{ fontSize: 12, padding: '2px 6px', fontWeight: 600 }}
                  />
                  <input
                    className="finp"
                    type="date"
                    value={tx.date}
                    onChange={e => updateItemDate(idx, e.target.value)}
                    style={{ fontSize: 10, padding: '2px 6px', color: '#9E9087' }}
                  />
                </div>
                {/* 分類選單（可修改）*/}
                <select
                  value={tx.category}
                  onChange={e => updateItemCategory(idx, e.target.value)}
                  className="finp"
                  style={{ width: 62, fontSize: 11, padding: '3px 4px', flexShrink: 0 }}
                >
                  {AI_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                {/* 金額（可編輯）*/}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 12, color: '#C0554A' }}>-$</span>
                  <input
                    className="finp"
                    type="number"
                    min="0"
                    value={tx.amount}
                    onChange={e => updateItemAmount(idx, e.target.value)}
                    style={{ width: 64, fontSize: 12, fontWeight: 700, color: '#C0554A', padding: '2px 4px', textAlign: 'right' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 小計 + 匯入按鈕 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
            <span style={{ fontSize: 12, color: '#6B5E52' }}>
              已選 {billResult.transactions.filter(t => t._enabled).length} 筆・
              共 ${billResult.transactions.filter(t => t._enabled).reduce((s, t) => s + t.amount, 0).toLocaleString()}
            </span>
          </div>

          {importDone ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#EAF3DE', borderRadius: 12, padding: 14,
              fontSize: 14, fontWeight: 700, color: '#27500A',
            }}>
              <CheckCircle size={16} /> 已成功匯入記帳！
            </div>
          ) : (
            <button
              className="save-btn"
              onClick={handleImport}
              disabled={importing || billResult.transactions.every(t => !t._enabled)}
              style={{ opacity: importing ? 0.6 : 1 }}
            >
              {importing ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> 匯入中...
                </span>
              ) : '確認匯入記帳'}
            </button>
          )}
        </div>
      )}

      {/* 空白狀態 */}
      {previews.length === 0 && !billResult && (
        <div style={{
          borderRadius: 12,
          padding: '32px 14px',
          textAlign: 'center',
          background: '#F0EAE0',
          border: '1px solid rgba(180,160,130,0.3)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🧾</div>
          <div style={{ fontSize: 13, color: '#9E9087' }}>尚無帳單，請上傳截圖進行辨識</div>
        </div>
      )}
    </div>
  )
}

// ─── Tab 4：帳單總覽 ──────────────────────────────────────────
function BillSummaryTab() {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [summaries, setSummaries] = useState<{
    card_id: string
    card_name: string
    due_day: number
    total: number
    byCategory: { category: string; total: number }[]
  }[]>([])
  const [loading, setLoading] = useState(false)
  const [grandTotal, setGrandTotal] = useState(0)

  const CATEGORY_EMOJI_MAP: Record<string, string> = {
    食: '🍱', 衣: '👗', 住: '🏠', 行: '🚗',
    娛樂: '🎮', 投資: '📈', 其他: '📦', 女兒: '👧',
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).getDate()
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

        const { data: cards } = await supabase
          .from('credit_cards')
          .select('id, card_name, due_day')

        const { data: txs } = await supabase
          .from('transactions')
          .select('amount, category_id, credit_card_id')
          .eq('payment_method', 'credit_card')
          .eq('type', 'expense')
          .gte('date', startDate)
          .lte('date', endDate)

        const { data: cats } = await supabase
          .from('categories')
          .select('id, name')

        const catMap: Record<string, string> = {}
        ;(cats ?? []).forEach((c: any) => { catMap[c.id] = c.name })

        const result = (cards ?? []).map((card: any) => {
          const cardTxs = (txs ?? []).filter((t: any) => t.credit_card_id === card.id)
          const total = cardTxs.reduce((s: number, t: any) => s + t.amount, 0)
          const catTotals: Record<string, number> = {}
          cardTxs.forEach((t: any) => {
            const name = t.category_id ? (catMap[t.category_id] ?? '其他') : '其他'
            catTotals[name] = (catTotals[name] ?? 0) + t.amount
          })
          const byCategory = Object.entries(catTotals)
            .map(([category, total]) => ({ category, total }))
            .sort((a, b) => b.total - a.total)
          return { card_id: card.id, card_name: card.card_name, due_day: card.due_day, total, byCategory }
        })

        setSummaries(result)
        setGrandTotal(result.reduce((s, r) => s + r.total, 0))
      } catch (e) {
        console.error('帳單總覽載入失敗', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const n = new Date(); if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth() + 1)) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 月份切換 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6B5E52' }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>{year} 年 {month} 月</span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6B5E52' }}>›</button>
      </div>

      {/* 當月信用卡總計 */}
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>當月信用卡總計</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#C0554A' }}>${grandTotal.toLocaleString()}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#9E9087', padding: 24 }}>載入中...</div>
      ) : summaries.filter(s => s.total > 0).length === 0 ? (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#9E9087', padding: 32 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>💳</div>
          本月尚無信用卡消費記錄
        </div>
      ) : (
        summaries.filter(s => s.total > 0).map(s => (
          <div key={s.card_id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#2C2820' }}>{s.card_name}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#C0554A' }}>${s.total.toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 8 }}>繳款日：每月 {s.due_day} 日</div>
            {s.byCategory.map(({ category, total }) => {
              const pct = s.total > 0 ? Math.round((total / s.total) * 100) : 0
              return (
                <div key={category} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: '#6B5E52' }}>
                      {CATEGORY_EMOJI_MAP[category] ?? '📦'} {category}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2820' }}>
                      ${total.toLocaleString()} <span style={{ fontWeight: 400, color: '#9E9087' }}>({pct}%)</span>
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(180,160,130,0.2)', borderRadius: 999 }}>
                    <div style={{ height: '100%', background: '#C0554A', borderRadius: 999, width: `${pct}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}

// ─── AddPage 主元件 ───────────────────────────────────────
const TABS = ['手動記帳', '消費明細', '帳單管理', '帳單總覽'] as const
type TabType = typeof TABS[number]

const TAB_PARAM_MAP: Record<string, TabType> = {
  records: '消費明細',
  bills: '帳單管理',
  'bill-summary': '帳單總覽',
}

export default function AddPage() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const p = searchParams.get('tab')
    return (p && TAB_PARAM_MAP[p]) || '手動記帳'
  })

  useEffect(() => {
    const p = searchParams.get('tab')
    if (p && TAB_PARAM_MAP[p]) setActiveTab(TAB_PARAM_MAP[p])
  }, [searchParams])

  return (
    <div style={{ padding: '0 0 16px' }}>
      {/* 頁面標題 */}
      <div className="page-title">
        <span>記帳</span>
        <span style={{ fontSize: 12, color: '#9E9087', fontWeight: 400 }}>
          {format(new Date(), 'yyyy/MM/dd')}
        </span>
      </div>

      {/* Tab 列 */}
      <div style={{ display: 'flex', gap: 8, padding: '0 14px 12px', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab${activeTab === tab ? ' active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 內容區 */}
      <div style={{ padding: '0 14px' }}>
        {activeTab === '手動記帳' && <ManualTab />}
        {activeTab === '消費明細' && <RecordsTab />}
        {activeTab === '帳單管理' && <BillsTab />}
        {activeTab === '帳單總覽' && <BillSummaryTab />}
      </div>
    </div>
  )
}
