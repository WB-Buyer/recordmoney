import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { Plus, Loader, CheckCircle, AlertCircle, ChevronDown, Pencil, X, RefreshCw, Target } from 'lucide-react'
import {
  getStocks, getInvestments, insertStock, insertInvestment, updateStockPrice,
  getDividends, insertDividend,
  supabase,
  type Stock, type Investment, type StockInsert, type InvestmentInsert,
  type Dividend, type DividendInsert,
} from '../lib/supabase'
import { getStockName, isLeveraged, isDR } from '../lib/stockNames'

// ─── 衍生統計 ──────────────────────────────────────────────
interface StockWithStats extends Stock {
  investments: Investment[]
  dividends: Dividend[]
  totalShares: number
  avgCost: number
  marketValue: number
  pnl: number
  pnlPct: number
  totalDividends: number
  totalReturn: number
  totalReturnPct: number
}

function computeStats(stock: Stock, investments: Investment[], dividends: Dividend[]): StockWithStats {
  const mine     = investments.filter(i => i.stock_id === stock.id)
  const myDivs   = dividends.filter(d => d.stock_id === stock.id)
  const totalShares    = mine.reduce((s, i) => s + i.shares, 0)
  const totalCost      = mine.reduce((s, i) => s + i.shares * i.cost_per_share, 0)
  const avgCost        = totalShares > 0 ? totalCost / totalShares : 0
  const marketValue    = totalShares * stock.current_price
  const pnl            = marketValue - totalCost
  const pnlPct         = totalCost > 0 ? (pnl / totalCost) * 100 : 0
  const totalDividends = myDivs.reduce((s, d) => s + d.total_amount, 0)
  const totalReturn    = pnl + totalDividends
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0
  return { ...stock, investments: mine, dividends: myDivs, totalShares, avgCost, marketValue, pnl, pnlPct, totalDividends, totalReturn, totalReturnPct }
}

const SOURCE_OPTIONS = ['老婆', '老公', '女兒'] as const
type Source = typeof SOURCE_OPTIONS[number]

const sourceChip = (s: string) => {
  if (s === '老婆') return 'chip-blue'
  if (s === '老公') return 'chip-amber'
  if (s === '女兒') return 'chip-green'
  return 'chip-purple'
}

// ─── 透過 Edge Function 搜尋股票（繞過 CORS）────────────────
async function fetchStockInfo(code: string, market: 'tw' | 'us'): Promise<{ name: string; price: number } | null> {
  const sym = code.trim().toUpperCase()
  const mkt = market === 'tw' ? 'TW' : 'US'

  // 5 秒 timeout：supabase.functions.invoke 不支援 AbortController，用 Promise.race
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 5000)
  )
  const invokePromise = supabase.functions.invoke('stock-search', {
    body: { symbol: sym, market: mkt }
  }).then(({ data, error }) => {
    if (error || !data) return null
    return { name: (data.name as string) ?? '', price: (data.price as number) ?? 0 }
  }).catch(() => null)

  const result = await Promise.race([invokePromise, timeoutPromise])

  if (result) return result

  // Edge Function 失敗或逾時 → 用本地對照表作為 fallback
  console.warn('[EdgeFn] stock-search 失敗或逾時，改用本地對照表')
  const localName = getStockName(sym, mkt)
  return {
    name: localName !== sym ? localName : '',  // 對照表有找到才填入
    price: 0,  // 現價讓使用者手動輸入
  }
}

// ─── Toast ─────────────────────────────────────────────────
function Toast({ type, msg }: { type: 'ok' | 'err'; msg: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      background: type === 'ok' ? '#5E9B6A' : '#C0554A',
      color: '#fff', padding: '12px 20px', borderRadius: 99,
      fontSize: 14, fontWeight: 500,
      whiteSpace: 'nowrap', zIndex: 600,
      animation: 'fadeIn 0.2s ease',
    }}>
      {type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg}
    </div>
  )
}

// ─── Modal 外框 ────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const isDesktop = window.innerWidth >= 768
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 400, animation: 'fadeInOverlay 0.2s ease',
      }} />
      <div style={{
        position: 'fixed',
        ...(isDesktop
          ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: 16, width: 400, maxHeight: '90vh', overflowY: 'auto' }
          : { bottom: 0, left: 0, right: 0, borderRadius: '20px 20px 0 0', animation: 'slideUp 0.25s ease', maxHeight: '90vh', overflowY: 'auto' }
        ),
        background: '#F5F0E8',
        padding: 20, zIndex: 500,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9087', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

// ─── 表單欄位 ──────────────────────────────────────────────
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, color: '#9E9087' }}>{label}</label>
      {children}
    </div>
  )
}

// ─── TradingView 迷你圖表 ───────────────────────────────────
function TradingViewWidget({ code, market }: { code: string; market: 'tw' | 'us' }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const symbol = market === 'tw' ? `TWSE:${code}` : `NASDAQ:${code}`

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.innerHTML = ''

    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height: 160,
      locale: 'zh_TW',
      colorTheme: 'light',
      autosize: true,
      isTransparent: true,
    })
    el.appendChild(script)

    return () => { el.innerHTML = '' }
  }, [symbol])

  return (
    <div
      ref={containerRef}
      style={{
        background: '#F5F0E8',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 8,
        minHeight: 160,
      }}
    />
  )
}

// ─── 新增持股 Modal（改善版 5 步驟）─────────────────────────
function AddStockModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: (stock: Stock, investments: InvestmentInsert[]) => void
}) {
  const [step, setStep]           = useState(1)
  const [market, setMarket]       = useState<'tw' | 'us'>('tw')
  const [code, setCode]           = useState('')
  const [name, setName]           = useState('')
  const [unit, setUnit]           = useState<'張' | '股'>('張')
  const [price, setPrice]         = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  // 投入記錄（可多筆）
  const [invRows, setInvRows] = useState([
    { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', fee: '', source: '老婆' as Source }
  ])

  // 定期定額
  const [isDCA, setIsDCA]         = useState(false)
  const [dcaAmount, setDcaAmount] = useState('')
  const [dcaDay, setDcaDay]       = useState('5')
  const [dcaAccount, setDcaAccount] = useState('台新薪轉')

  const currency: 'TWD' | 'USD' = market === 'tw' ? 'TWD' : 'USD'
  const currSymbol = currency === 'TWD' ? '$' : 'USD '

  // onChange：立即查靜態表（問題 5：使用 stockNames.ts）
  function handleCodeChange(val: string) {
    setCode(val)
    setErr('')
    const sym = val.trim()
    if (!sym) { setName(''); return }
    const mktKey = market === 'tw' ? 'TW' : 'US'
    const staticName = getStockName(sym, mktKey)
    // 若靜態表有找到（非原始代號），則設定名稱
    if (staticName && staticName !== sym.toUpperCase()) setName(staticName)
  }

  // 切換市場時重新查靜態表
  useEffect(() => {
    const sym = code.trim()
    if (!sym) return
    const mktKey = market === 'tw' ? 'TW' : 'US'
    const staticName = getStockName(sym, mktKey)
    if (staticName && staticName !== sym.toUpperCase()) setName(staticName)
  }, [market])

  // debounce 800ms：呼叫 Edge Function 取得即時現價
  useEffect(() => {
    const sym = code.trim()
    if (!sym || sym.length < 2) return
    const timer = setTimeout(async () => {
      console.log('[EdgeFn] invoking stock-search for', sym, market)
      setSearching(true)
      try {
        const info = await fetchStockInfo(sym, market)
        console.log('[EdgeFn] result:', info)
        if (info) {
          // 靜態表若有中文名稱則優先保留，不被 Edge Function 英文名覆蓋
          const mktKey = market === 'tw' ? 'TW' : 'US'
          const staticName = getStockName(sym, mktKey)
          const hasStaticName = staticName !== sym.toUpperCase()
          if (info.name && !hasStaticName) setName(info.name)
          // 確保 price 是有效數字
          const numPrice = parseFloat(String(info.price))
          if (!isNaN(numPrice) && numPrice > 0) setPrice(String(numPrice))
        }
      } finally {
        setSearching(false)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [code, market])

  // 按鈕：確保有名稱後前往下一步
  async function handleSearch() {
    const sym = code.trim()
    if (!sym) { setErr('請輸入股票代號'); return }
    const staticName = getStockName(sym, market === 'tw' ? 'TW' : 'US')
    if (!name && staticName !== sym.toUpperCase()) setName(staticName)
    if (!name && (staticName === sym.toUpperCase())) { setErr('請輸入股票名稱'); return }
    setStep(2)
  }

  function addInvRow() {
    setInvRows(prev => [...prev, { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', fee: '', source: '老婆' as Source }])
  }

  function updateInvRow(idx: number, field: string, value: string) {
    setInvRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function removeInvRow(idx: number) {
    setInvRows(prev => prev.filter((_, i) => i !== idx))
  }

  // 換算股數
  function qtyToShares(qty: string): number {
    const n = parseFloat(qty)
    if (isNaN(n)) return 0
    return unit === '張' ? n * 1000 : n
  }

  // 總計
  const totalShares = invRows.reduce((s, r) => s + qtyToShares(r.qty), 0)
  const totalCost   = invRows.reduce((s, r) => {
    const sh  = qtyToShares(r.qty)
    const co  = parseFloat(r.cost)
    const fee = parseFloat(r.fee) || 0
    return s + (isNaN(co) ? 0 : sh * co) + fee
  }, 0)
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0

  async function handleSave() {
    const sym = code.trim()
    const nm  = name.trim()
    // 靜態表中文名優先；靜態表查無結果才退而使用 name state（可能是 Edge Function 結果或手動輸入）
    const mktKey = market === 'tw' ? 'TW' : 'US'
    const staticName = getStockName(sym, mktKey)
    const hasStaticName = staticName !== sym.toUpperCase()
    const fallbackName = hasStaticName ? staticName : nm
    if (!sym || !fallbackName) { setErr('請輸入股票代號與名稱'); return }
    if (!nm) setName(fallbackName)
    const p = isNaN(parseFloat(price)) ? 0 : parseFloat(price)   // 空白現價預設 0，可事後更新
    if (p < 0) { setErr('現價不能為負數'); return }
    if (invRows.some(r => !r.qty || !r.cost)) { setErr('請填寫所有投入記錄'); return }

    setSaving(true)
    try {
      const payload: StockInsert = {
        market,
        symbol: sym.toUpperCase(),
        name: fallbackName,
        currency,
        current_price: p,
      }
      const saved = await insertStock(payload)
      const invPayloads: InvestmentInsert[] = invRows.map(r => ({
        stock_id: saved.id,
        date: r.date,
        shares: qtyToShares(r.qty),
        cost_per_share: parseFloat(r.cost),
        source: r.source,
      }))
      for (const inv of invPayloads) {
        await insertInvestment(inv)
      }

      // 從對應帳戶扣款（台股 → 永豐大戶；美股 → 國泰美金）
      try {
        const deductAccount = market === 'tw' ? '永豐大戶' : '國泰美金'
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: acct } = await supabase
            .from('bank_accounts')
            .select('id, balance')
            .eq('user_id', user.id)
            .eq('name', deductAccount)
            .single()
          if (acct) {
            const newBalance = acct.balance - totalCost
            await supabase
              .from('bank_accounts')
              .update({ balance: newBalance, updated_at: new Date().toISOString() })
              .eq('id', acct.id)
          }
        }
      } catch (e) {
        console.warn('帳戶扣款失敗（不影響股票儲存）:', e)
      }

      onSaved(saved, invPayloads)
    } catch (e: any) {
      setErr(e.message ?? '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const stepTitles = ['搜尋股票', '持股單位', '投入記錄', '定期定額', '確認儲存']

  return (
    <Modal title="新增持股" onClose={onClose}>
      {/* 步驟指示器 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {stepTitles.map((t, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', margin: '0 auto 4px',
              background: step > i + 1 ? '#5E9B6A' : step === i + 1 ? '#2C2820' : '#DDD5C8',
              color: step >= i + 1 ? '#fff' : '#9E9087',
              fontSize: 11, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 9, color: step === i + 1 ? '#2C2820' : '#9E9087', fontWeight: step === i + 1 ? 700 : 400 }}>
              {t}
            </div>
          </div>
        ))}
      </div>

      {err && <div style={{ fontSize: 12, color: '#C0554A', marginBottom: 10 }}>{err}</div>}

      {/* Step 1：搜尋股票 */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormRow label="市場">
            <select className="finp" value={market} onChange={e => setMarket(e.target.value as 'tw' | 'us')}>
              <option value="tw">台股（TWD）</option>
              <option value="us">美股（USD）</option>
            </select>
          </FormRow>
          <FormRow label="股票代號">
            <input
              className="finp"
              placeholder={market === 'tw' ? '例如 2330、0050' : '例如 NVDA、AAPL'}
              value={code}
              onChange={e => handleCodeChange(e.target.value)}
            />
          </FormRow>
          <FormRow label={`股票名稱${searching ? '（取得中...）' : '（自動填入，可手動修改）'}`}>
            <input
              className="finp"
              placeholder={searching ? '取得中...' : '輸入代號後自動帶入'}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </FormRow>
          <FormRow label={`現價（${currency}）`}>
            <input
              className="finp"
              type="number"
              min="0"
              step="0.01"
              placeholder="自動取得或手動輸入"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </FormRow>
          <button
            className="save-btn"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> 搜尋中...</span>
              : '搜尋並繼續'}
          </button>
        </div>
      )}

      {/* Step 2：持股單位 */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: '#EAE3D8', borderRadius: 10, padding: '10px 14px',
            fontSize: 13, fontWeight: 600, color: '#2C2820',
          }}>
            {code.toUpperCase()} {name}
          </div>
          <FormRow label="持股單位">
            <div style={{ display: 'flex', gap: 8 }}>
              {(['張', '股'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`cat-pill${unit === u ? ' active' : ''}`}
                  style={{ flex: 1 }}
                >
                  {u}{u === '張' ? '（1張=1000股）' : '（直接輸入）'}
                </button>
              ))}
            </div>
          </FormRow>
          {unit === '張' && (
            <div style={{
              background: 'rgba(180,160,130,0.15)', borderRadius: 8,
              padding: '8px 12px', fontSize: 12, color: '#6B5E52',
            }}>
              以「張」為單位，系統自動換算：1張 = 1,000股
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="save-btn" style={{ background: '#9E9087' }} onClick={() => setStep(1)}>上一步</button>
            <button className="save-btn" onClick={() => setStep(3)}>下一步</button>
          </div>
        </div>
      )}

      {/* Step 3：投入記錄 */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#9E9087', marginBottom: 4 }}>
            可新增多筆投入記錄（單位：{unit}）
          </div>
          {invRows.map((row, idx) => (
            <div key={idx} style={{
              background: '#EAE3D8', borderRadius: 10, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 8, position: 'relative',
            }}>
              {invRows.length > 1 && (
                <button
                  onClick={() => removeInvRow(idx)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#C0554A', padding: 2,
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#9E9087', marginBottom: 3 }}>日期</div>
                  <input className="finp" type="date" value={row.date}
                    onChange={e => updateInvRow(idx, 'date', e.target.value)}
                    style={{ fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9E9087', marginBottom: 3 }}>資金來源</div>
                  <select className="finp" value={row.source}
                    onChange={e => updateInvRow(idx, 'source', e.target.value)}
                    style={{ fontSize: 12 }}>
                    {SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#9E9087', marginBottom: 3 }}>買入數量（{unit}）</div>
                  <input className="finp" type="number" min="0" step={unit === '張' ? '0.001' : '1'}
                    value={row.qty}
                    onChange={e => updateInvRow(idx, 'qty', e.target.value)}
                    placeholder="0" style={{ fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#9E9087', marginBottom: 3 }}>買入價格（每股）</div>
                  <input className="finp" type="number" min="0" step="0.01"
                    value={row.cost}
                    onChange={e => updateInvRow(idx, 'cost', e.target.value)}
                    placeholder="0" style={{ fontSize: 12 }} />
                </div>
              </div>
              <div>
                <input
                  className="finp"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="手續費（選填）"
                  value={row.fee}
                  onChange={e => updateInvRow(idx, 'fee', e.target.value)}
                  style={{ marginTop: 6, fontSize: 12 }}
                />
                <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>手續費</div>
              </div>
              {row.qty && row.cost && (
                <div style={{ fontSize: 11, color: '#6B5E52' }}>
                  = {qtyToShares(row.qty).toLocaleString()}股 · 投入 {currSymbol}{(qtyToShares(row.qty) * parseFloat(row.cost)).toLocaleString()}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addInvRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(180,160,130,0.18)',
              border: '1px dashed rgba(180,160,130,0.5)',
              borderRadius: 8, padding: '8px 12px',
              fontSize: 12, color: '#6B5E52', cursor: 'pointer',
              fontFamily: 'inherit', justifyContent: 'center',
            }}
          >
            <Plus size={14} /> 新增一筆
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="save-btn" style={{ background: '#9E9087' }} onClick={() => setStep(2)}>上一步</button>
            <button className="save-btn" onClick={() => setStep(4)}>下一步</button>
          </div>
        </div>
      )}

      {/* Step 4：定期定額 */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormRow label="是否為定期定額">
            <div style={{ display: 'flex', gap: 8 }}>
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setIsDCA(v)}
                  className={`cat-pill${isDCA === v ? ' active' : ''}`}
                  style={{ flex: 1 }}
                >
                  {v ? '是' : '否'}
                </button>
              ))}
            </div>
          </FormRow>
          {isDCA && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <FormRow label="每月金額">
                  <input className="finp" type="number" value={dcaAmount}
                    onChange={e => setDcaAmount(e.target.value)} placeholder="5000" />
                </FormRow>
                <FormRow label="扣款日">
                  <input className="finp" type="number" min="1" max="31" value={dcaDay}
                    onChange={e => setDcaDay(e.target.value)} placeholder="5" />
                </FormRow>
              </div>
              <FormRow label="對應帳戶">
                <select className="finp" value={dcaAccount} onChange={e => setDcaAccount(e.target.value)}>
                  {['台新薪轉', '台新 Richart', '國泰 Cube', '永豐大戶', '玉山', '富邦'].map(a => <option key={a}>{a}</option>)}
                </select>
              </FormRow>
              {dcaAmount && dcaDay && (
                <div style={{
                  background: 'rgba(180,160,130,0.15)', borderRadius: 8,
                  padding: '8px 12px', fontSize: 12, color: '#6B5E52',
                }}>
                  每月 {dcaDay} 日從「{dcaAccount}」扣款 {currSymbol}{parseFloat(dcaAmount).toLocaleString()} 買入 {code.toUpperCase()}
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="save-btn" style={{ background: '#9E9087' }} onClick={() => setStep(3)}>上一步</button>
            <button className="save-btn" onClick={() => setStep(5)}>查看摘要</button>
          </div>
        </div>
      )}

      {/* Step 5：確認摘要 */}
      {step === 5 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ background: '#EAE3D8' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 10 }}>持股摘要</div>
            {[
              ['股票', `${code.toUpperCase()} ${name}`],
              ['市場', market === 'tw' ? '台股' : '美股'],
              ['總持股數', `${totalShares.toLocaleString()} 股${unit === '張' ? `（${(totalShares/1000).toLocaleString()}張）` : ''}`],
              ['平均成本', `${currSymbol}${avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}`],
              ['總投入金額', `${currSymbol}${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
              ['現價', price && !isNaN(parseFloat(price)) ? `${currSymbol}${parseFloat(price).toLocaleString()}` : '—（儲存後可手動更新）'],
            ].map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '4px 0', borderBottom: '1px solid rgba(180,160,130,0.2)',
                fontSize: 12,
              }}>
                <span style={{ color: '#9E9087' }}>{label}</span>
                <span style={{ color: '#2C2820', fontWeight: 600 }}>{value}</span>
              </div>
            ))}
            {isDCA && dcaAmount && (
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '4px 0', fontSize: 12,
              }}>
                <span style={{ color: '#9E9087' }}>定期定額</span>
                <span style={{ color: '#2C2820', fontWeight: 600 }}>每月{dcaDay}日 {currSymbol}{dcaAmount}</span>
              </div>
            )}
          </div>
          {invRows.some(r => parseFloat(r.fee) > 0) && (
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 4 }}>
              含手續費：{currSymbol}{invRows.reduce((s, r) => s + (parseFloat(r.fee) || 0), 0).toLocaleString()}
            </div>
          )}
          {err && <div style={{ fontSize: 12, color: '#C0554A' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="save-btn" style={{ background: '#9E9087' }} onClick={() => setStep(4)}>上一步</button>
            <button className="save-btn" onClick={handleSave} disabled={saving}>
              {saving ? '儲存中...' : '確認新增'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── 新增投入 Modal ────────────────────────────────────────
function AddInvestmentModal({ stock, onClose, onSaved }: {
  stock: StockWithStats
  onClose: () => void
  onSaved: (inv: Investment) => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate]     = useState(today)
  const [shares, setShares] = useState('')
  const [cost, setCost]     = useState('')
  const [source, setSource] = useState<Source>('老婆')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const currency = stock.currency === 'TWD' ? '$' : 'USD '

  async function handleSave() {
    const sh = parseFloat(shares)
    const co = parseFloat(cost)
    if (isNaN(sh) || sh <= 0) { setErr('請輸入有效股數'); return }
    if (isNaN(co) || co < 0)  { setErr('請輸入有效成本價'); return }
    setSaving(true)
    try {
      const payload: InvestmentInsert = {
        stock_id: stock.id,
        date,
        shares: sh,
        cost_per_share: co,
        source,
      }
      const saved = await insertInvestment(payload)
      onSaved(saved)
    } catch (e: any) {
      setErr(e.message ?? '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`新增投入 · ${stock.symbol} ${stock.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormRow label="日期">
          <input className="finp" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormRow>

        <FormRow label="股數">
          <input
            className="finp"
            type="number"
            min="0"
            step="1"
            placeholder="0"
            value={shares}
            onChange={e => setShares(e.target.value)}
          />
        </FormRow>

        <FormRow label={`成本價（${currency.trim()}）`}>
          <input
            className="finp"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={cost}
            onChange={e => setCost(e.target.value)}
          />
        </FormRow>

        <FormRow label="資金來源">
          <select className="finp" value={source} onChange={e => setSource(e.target.value as Source)}>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FormRow>

        {shares && cost && !isNaN(+shares) && !isNaN(+cost) && (
          <div style={{
            background: 'rgba(180,160,130,0.15)', borderRadius: 10,
            padding: '8px 12px', fontSize: 12, color: '#6B5E52',
          }}>
            投入總額：{currency}{(+shares * +cost).toLocaleString()}
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#C0554A' }}>{err}</div>}

        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? '儲存中...' : '新增投入'}
        </button>
      </div>
    </Modal>
  )
}

// ─── 校正庫存 Modal ────────────────────────────────────────
function AdjustSharesModal({ stock, onClose, onAdjusted }: {
  stock: StockWithStats
  onClose: () => void
  onAdjusted: (newShares: number) => void
}) {
  const [shares, setShares] = useState(String(stock.totalShares))
  const [saving, setSaving] = useState(false)
  const diff = parseFloat(shares) - stock.totalShares

  async function handleSave() {
    const n = parseFloat(shares)
    if (isNaN(n) || n < 0) return
    if (n === stock.totalShares) { onClose(); return }
    setSaving(true)
    try {
      // 新增一筆差額投入記錄
      if (diff !== 0) {
        const payload: InvestmentInsert = {
          stock_id: stock.id,
          date: format(new Date(), 'yyyy-MM-dd'),
          shares: diff,
          cost_per_share: stock.avgCost,
          source: '校正',
        }
        await insertInvestment(payload)
      }
      onAdjusted(n)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`校正庫存 · ${stock.symbol}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: '#9E9087' }}>
          目前記錄股數：{stock.totalShares.toLocaleString()} 股
        </div>
        <FormRow label="實際持股數量（股）">
          <input
            className="finp"
            type="number"
            min="0"
            step="1"
            value={shares}
            onChange={e => setShares(e.target.value)}
          />
        </FormRow>
        {shares && !isNaN(parseFloat(shares)) && diff !== 0 && (
          <div style={{
            background: diff > 0 ? '#EAF3DE' : '#FCEBEB',
            borderRadius: 8, padding: '8px 12px', fontSize: 12,
            color: diff > 0 ? '#27500A' : '#791F1F',
          }}>
            差異：{diff > 0 ? '+' : ''}{diff.toLocaleString()} 股，將以均價 ${stock.avgCost.toFixed(2)} 記錄校正
          </div>
        )}
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? '校正中...' : '確認校正'}
        </button>
      </div>
    </Modal>
  )
}

// ─── 新增配息 Modal ────────────────────────────────────────
function AddDividendModal({ stock, onClose, onSaved }: {
  stock: StockWithStats
  onClose: () => void
  onSaved: (div: Dividend) => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate]           = useState(today)
  const [divPerShare, setDivPerShare] = useState('')
  const [shares, setShares]       = useState(String(stock.totalShares))
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  const currency = stock.currency === 'TWD' ? '$' : 'USD '
  const dps = parseFloat(divPerShare)
  const sh  = parseFloat(shares)
  const total = !isNaN(dps) && !isNaN(sh) ? dps * sh : 0

  async function handleSave() {
    if (isNaN(dps) || dps <= 0) { setErr('請輸入每股配息金額'); return }
    if (isNaN(sh) || sh <= 0)   { setErr('請輸入配息股數'); return }
    setSaving(true)
    try {
      const payload: DividendInsert = {
        stock_id: stock.id,
        date,
        dividend_per_share: dps,
        shares: sh,
        total_amount: Math.round(total * 100) / 100,
        currency: stock.currency,
        note: note || undefined,
      }
      const saved = await insertDividend(payload)
      onSaved(saved)
    } catch (e: any) {
      setErr(e.message ?? '儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`新增配息 · ${stock.symbol} ${stock.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        <FormRow label="配息日期">
          <input className="finp" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </FormRow>

        <FormRow label={`每股配息（${currency.trim()}）`}>
          <input
            className="finp"
            type="number"
            min="0"
            step="0.01"
            placeholder="例如 3.5"
            value={divPerShare}
            onChange={e => setDivPerShare(e.target.value)}
          />
        </FormRow>

        <FormRow label="配息股數">
          <input
            className="finp"
            type="number"
            min="0"
            step="1"
            value={shares}
            onChange={e => setShares(e.target.value)}
          />
        </FormRow>

        {/* 自動計算總金額（唯讀） */}
        <div style={{
          background: total > 0 ? '#EAF3DE' : 'rgba(180,160,130,0.12)',
          borderRadius: 10, padding: '10px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#6B5E52' }}>配息總金額</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: total > 0 ? '#27500A' : '#9E9087' }}>
            {total > 0 ? `${currency}${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
          </span>
        </div>

        <FormRow label="備註（選填）">
          <input
            className="finp"
            placeholder="例如：2024Q4 現金股利"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </FormRow>

        {err && <div style={{ fontSize: 12, color: '#C0554A' }}>{err}</div>}

        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? '儲存中...' : '儲存配息紀錄'}
        </button>
      </div>
    </Modal>
  )
}

// ─── 現價行內編輯 ──────────────────────────────────────────
function PriceEditor({ stock, onUpdated }: {
  stock: StockWithStats
  onUpdated: (price: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(String(stock.current_price))
  const [saving, setSaving]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const currency = stock.currency === 'TWD' ? '$' : 'USD '

  function startEdit() {
    setVal(String(stock.current_price))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commit() {
    const p = parseFloat(val)
    if (isNaN(p) || p < 0) { setEditing(false); return }
    if (p === stock.current_price) { setEditing(false); return }
    setSaving(true)
    try {
      await updateStockPrice(stock.id, p)
      onUpdated(p)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          ref={inputRef}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          style={{
            width: 80, fontSize: 13, fontWeight: 700, color: '#2C2820',
            background: '#F0EAE0', border: '1px solid rgba(180,160,130,0.6)',
            borderRadius: 6, padding: '2px 6px', fontFamily: 'inherit',
            textAlign: 'right',
          }}
          disabled={saving}
          autoFocus
        />
        {saving && <Loader size={12} style={{ color: '#9E9087', animation: 'spin 1s linear infinite' }} />}
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}
      onClick={startEdit}
      title="點擊手動編輯現價"
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#2C2820' }}>
        {currency}{stock.current_price.toLocaleString()}
      </span>
      <Pencil size={10} style={{ color: '#9E9087' }} />
    </div>
  )
}

// ─── StockRow ──────────────────────────────────────────────
function StockRow({ stock, onAddInvestment, onPriceUpdated, onAdjust, onAddDividend }: {
  stock: StockWithStats
  onAddInvestment: (s: StockWithStats) => void
  onPriceUpdated: (id: string, price: number) => void
  onAdjust: (s: StockWithStats) => void
  onAddDividend: (s: StockWithStats) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { pnl, pnlPct, avgCost, totalShares, marketValue } = stock
  const pnlPositive = pnl >= 0
  const currency = stock.currency === 'TWD' ? '$' : 'USD '

  return (
    <>
      {/* 主列 */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          borderBottom: '1px solid rgba(180,160,130,0.15)',
          background: expanded ? 'rgba(221,213,200,0.25)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {/* 代號 */}
        <div style={{
          background: '#DDD5C8', borderRadius: 8,
          width: 48, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#2C2820',
          overflow: 'hidden',
        }}>
          {stock.symbol}
        </div>

        {/* 問題 5：中文名稱為主，代號縮小顯示，加槓桿/DR 標籤 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2820', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stock.name}
            </span>
            {isLeveraged(stock.symbol) && (
              <span style={{ fontSize: 9, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 4px', fontWeight: 700, flexShrink: 0 }}>
                槓桿
              </span>
            )}
            {isDR(stock.symbol) && (
              <span style={{ fontSize: 9, background: '#E0E7FF', color: '#3730A3', borderRadius: 4, padding: '1px 4px', fontWeight: 700, flexShrink: 0 }}>
                DR
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>
            {totalShares.toLocaleString()}股 · 均價 {currency}{avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            · {stock.currency}
          </div>
        </div>

        {/* 現價與損益 */}
        <div onClick={e => e.stopPropagation()} style={{ textAlign: 'right', flexShrink: 0 }}>
          <PriceEditor stock={stock} onUpdated={p => onPriceUpdated(stock.id, p)} />
          {totalShares > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: pnlPositive ? '#5E9B6A' : '#C0554A' }}>
              {pnlPositive ? '+' : ''}{pnlPct.toFixed(1)}%
            </div>
          )}
        </div>

        <ChevronDown size={14} style={{
          color: '#9E9087', flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }} />
      </div>

      {/* 展開：TradingView 圖表 + 投入明細 */}
      {expanded && (
        <div style={{
          background: 'rgba(221,213,200,0.2)',
          padding: '8px 14px 12px',
          borderBottom: '1px solid rgba(180,160,130,0.15)',
        }}>
          {/* TradingView 走勢圖 */}
          <TradingViewWidget code={stock.symbol} market={stock.market} />

          {/* 校正庫存按鈕 */}
          <button
            onClick={e => { e.stopPropagation(); onAdjust(stock) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 10,
              background: 'rgba(180,160,130,0.18)',
              border: '1px solid rgba(180,160,130,0.4)',
              borderRadius: 8, padding: '6px 12px',
              fontSize: 12, color: '#6B5E52', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Target size={13} /> 校正庫存
          </button>

          {stock.investments.length > 0 ? (
            <>
              <div style={{ fontSize: 10, color: '#9E9087', marginBottom: 6 }}>投入明細</div>
              {stock.investments.map((inv) => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '4px 0',
                  borderBottom: '1px solid rgba(180,160,130,0.1)',
                }}>
                  <span style={{ fontSize: 11, color: '#6B5E52', width: 72, flexShrink: 0 }}>{inv.date}</span>
                  <span style={{ fontSize: 11, color: '#2C2820', flex: 1, textAlign: 'center' }}>
                    {inv.shares.toLocaleString()}股 × {currency}{inv.cost_per_share.toLocaleString()}
                  </span>
                  <span className={`chip ${sourceChip(inv.source)}`}>{inv.source}</span>
                </div>
              ))}

              {/* 市值小結 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                marginTop: 8, paddingTop: 8,
                borderTop: '1px solid rgba(180,160,130,0.2)',
              }}>
                <span style={{ fontSize: 11, color: '#6B5E52' }}>當日市值</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2C2820' }}>
                  {currency}{marketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: pnlPositive ? '#5E9B6A' : '#C0554A' }}>
                  {pnlPositive ? '+' : ''}{currency}{Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              {/* 總報酬（含配息）*/}
              {stock.totalDividends > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  marginTop: 4, paddingTop: 4,
                  fontSize: 11, color: '#6B5E52',
                }}>
                  <span>總報酬（含配息）</span>
                  <span style={{ fontWeight: 700, color: stock.totalReturn >= 0 ? '#5E9B6A' : '#C0554A' }}>
                    {stock.totalReturn >= 0 ? '+' : ''}{currency}{Math.abs(stock.totalReturn).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    {' '}
                    <span style={{ fontSize: 10 }}>({stock.totalReturnPct >= 0 ? '+' : ''}{stock.totalReturnPct.toFixed(1)}%)</span>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: '#9E9087', textAlign: 'center', padding: '8px 0' }}>
              尚無投入記錄
            </div>
          )}

          {/* 新增投入按鈕 */}
          <button
            onClick={() => onAddInvestment(stock)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginTop: 10, width: '100%',
              background: 'rgba(180,160,130,0.18)',
              border: '1px dashed rgba(180,160,130,0.5)',
              borderRadius: 8, padding: '7px 12px',
              fontSize: 12, color: '#6B5E52', cursor: 'pointer',
              fontFamily: 'inherit', justifyContent: 'center',
            }}
          >
            <Plus size={14} />
            新增投入
          </button>

          {/* ── 配息紀錄區塊 ── */}
          <div style={{ marginTop: 14, borderTop: '1px solid rgba(180,160,130,0.25)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#9E9087', fontWeight: 600 }}>
                配息紀錄
                {stock.totalDividends > 0 && (
                  <span style={{ color: '#5E9B6A', marginLeft: 6 }}>
                    累計 {currency}{stock.totalDividends.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                )}
              </span>
            </div>

            {stock.dividends.length > 0 ? (
              <div style={{ marginBottom: 8 }}>
                {/* 表頭 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '72px 56px 1fr 80px',
                  padding: '3px 0', marginBottom: 4,
                  fontSize: 9, color: '#9E9087', fontWeight: 600,
                }}>
                  <span>日期</span>
                  <span>每股</span>
                  <span>股數</span>
                  <span style={{ textAlign: 'right' }}>總金額</span>
                </div>
                {stock.dividends.map(d => (
                  <div
                    key={d.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '72px 56px 1fr 80px',
                      padding: '4px 0', alignItems: 'center',
                      borderBottom: '1px solid rgba(180,160,130,0.1)',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: '#6B5E52' }}>{d.date}</span>
                    <span style={{ color: '#2C2820' }}>{currency}{d.dividend_per_share}</span>
                    <span style={{ color: '#6B5E52' }}>
                      {d.shares.toLocaleString()}股
                      {d.note && <span style={{ color: '#9E9087', marginLeft: 4, fontSize: 10 }}>· {d.note}</span>}
                    </span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#5E9B6A' }}>
                      +{currency}{d.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#9E9087', textAlign: 'center', padding: '6px 0 8px' }}>
                尚無配息紀錄
              </div>
            )}

            <button
              onClick={() => onAddDividend(stock)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', justifyContent: 'center',
                background: 'rgba(94,155,106,0.12)',
                border: '1px dashed rgba(94,155,106,0.5)',
                borderRadius: 8, padding: '7px 12px',
                fontSize: 12, color: '#5E9B6A', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <Plus size={14} />
              新增配息
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── StatsPage 主元件 ──────────────────────────────────────
export default function StatsPage() {
  const [activeTab, setActiveTab]           = useState<'tw' | 'us'>('tw')
  const [allStocks, setAllStocks]           = useState<StockWithStats[]>([])
  const [loading, setLoading]               = useState(true)
  const [showAddStock, setShowAddStock]     = useState(false)
  const [addInvFor, setAddInvFor]           = useState<StockWithStats | null>(null)
  const [adjustFor, setAdjustFor]           = useState<StockWithStats | null>(null)
  const [addDivFor, setAddDivFor]           = useState<StockWithStats | null>(null)
  const [toast, setToast]                   = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [updatingPrices, setUpdatingPrices] = useState(false)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2600)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [stocks, investments, dividends] = await Promise.all([
        getStocks(), getInvestments(), getDividends(),
      ])
      setAllStocks(stocks.map(s => computeStats(s, investments, dividends)))
    } catch (e: any) {
      showToast('err', e.message ?? '讀取失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 批次更新現價（透過 Edge Function 繞過 CORS）
  async function handleRefreshPrices() {
    setUpdatingPrices(true)
    let updated = 0
    const next = [...allStocks]
    for (let i = 0; i < next.length; i++) {
      const s = next[i]
      try {
        const info = await fetchStockInfo(s.symbol, s.market)
        if (info && info.price > 0 && info.price !== s.current_price) {
          await updateStockPrice(s.id, info.price)
          next[i] = computeStats({ ...s, current_price: info.price }, s.investments, s.dividends)
          updated++
        }
      } catch {
        // 單檔失敗不中斷整體更新
      }
    }
    setAllStocks(next)
    setUpdatingPrices(false)
    showToast('ok', updated > 0 ? `已更新 ${updated} 檔現價` : '所有現價已是最新')
  }

  // 處理現價更新
  function handlePriceUpdated(id: string, price: number) {
    setAllStocks(prev => prev.map(s => {
      if (s.id !== id) return s
      const updated: Stock = { ...s, current_price: price }
      return computeStats(updated, s.investments, s.dividends)
    }))
    showToast('ok', '現價已更新')
  }

  // 新增持股後（改善版 - 含投入記錄）
  async function handleStockSaved(stock: Stock, invPayloads: InvestmentInsert[]) {
    const invs: Investment[] = invPayloads.map((p, i) => ({
      id: `local-${i}`,
      created_at: new Date().toISOString(),
      ...p,
    }))
    const newStock = computeStats(stock, invs, [])
    setAllStocks(prev => [...prev, newStock])
    setShowAddStock(false)
    showToast('ok', `${stock.symbol} ${stock.name} 已新增`)
  }

  // 新增投入後
  function handleInvestmentSaved(inv: Investment) {
    setAllStocks(prev => prev.map(s => {
      if (s.id !== inv.stock_id) return s
      return computeStats(s, [...s.investments, inv], s.dividends)
    }))
    setAddInvFor(null)
    showToast('ok', '投入記錄已新增')
  }

  // 庫存校正後
  function handleAdjusted(stockId: string, newShares: number) {
    setAllStocks(prev => prev.map(s => {
      if (s.id !== stockId) return s
      const diff = newShares - s.totalShares
      const fakeInv: Investment = {
        id: `adj-${Date.now()}`,
        created_at: new Date().toISOString(),
        stock_id: stockId,
        date: format(new Date(), 'yyyy-MM-dd'),
        shares: diff,
        cost_per_share: s.avgCost,
        source: '校正',
      }
      const newInvestments = diff !== 0 ? [...s.investments, fakeInv] : s.investments
      return computeStats(s, newInvestments, s.dividends)
    }))
    setAdjustFor(null)
    showToast('ok', '庫存已校正')
  }

  // 新增配息後
  function handleDividendSaved(div: Dividend) {
    setAllStocks(prev => prev.map(s => {
      if (s.id !== div.stock_id) return s
      return computeStats(s, s.investments, [...s.dividends, div])
    }))
    setAddDivFor(null)
    showToast('ok', `配息 $${div.total_amount.toLocaleString()} 已記錄`)
  }

  const twStocks = allStocks.filter(s => s.market === 'tw')
  const usStocks = allStocks.filter(s => s.market === 'us')
  const currentStocks = activeTab === 'tw' ? twStocks : usStocks

  // 彙總統計
  const twMarketValue = twStocks.reduce((s, st) => s + st.marketValue, 0)
  const twCost        = twStocks.reduce((s, st) => s + st.totalShares * st.avgCost, 0)
  const twPnl         = twMarketValue - twCost

  const usMarketValue = usStocks.reduce((s, st) => s + st.marketValue, 0)
  const usCost        = usStocks.reduce((s, st) => s + st.totalShares * st.avgCost, 0)
  const usPnl         = usMarketValue - usCost

  const totalCost = twCost + usCost * 31
  const totalPnl  = twPnl + usPnl * 31

  const totalDividendsAll = allStocks.reduce((s, st) => s + st.totalDividends, 0)

  return (
    <div style={{ padding: '0 0 16px' }}>
      {/* 頁面標題 */}
      <div className="page-title">
        <span>投資組合</span>
        <button
          onClick={handleRefreshPrices}
          disabled={updatingPrices || loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: updatingPrices ? '#EAE3D8' : '#2C2820',
            color: updatingPrices ? '#9E9087' : 'white',
            border: 'none', borderRadius: 10,
            padding: '6px 12px', fontSize: 12, fontWeight: 700,
            cursor: updatingPrices ? 'wait' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={13} style={updatingPrices ? { animation: 'spin 1s linear infinite' } : {}} />
          更新現價
        </button>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 頂部四格統計 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 3 }}>台股庫存</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C2820' }}>${twMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 11, color: twPnl >= 0 ? '#5E9B6A' : '#C0554A', marginTop: 3 }}>
              {twStocks.length > 0
                ? `${twPnl >= 0 ? '+' : ''}$${twPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : '尚無持股'}
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 3 }}>美股庫存</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C2820' }}>USD {usMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 11, color: usPnl >= 0 ? '#5E9B6A' : '#C0554A', marginTop: 3 }}>
              {usStocks.length > 0
                ? `${usPnl >= 0 ? '+' : ''}USD ${usPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : '尚無持股'}
            </div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 3 }}>總投入成本</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2C2820' }}>${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 3 }}>台幣計算</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 3 }}>未實現損益</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: totalPnl >= 0 ? '#5E9B6A' : '#C0554A' }}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 3 }}>
              {totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}${((totalPnl / totalCost) * 100).toFixed(1)}%` : '–'}
            </div>
          </div>
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 3 }}>累計配息</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#5E9B6A' }}>
                  {totalDividendsAll > 0
                    ? `$${totalDividendsAll.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : '—'}
                </div>
              </div>
              <div style={{ fontSize: 28 }}>💰</div>
            </div>
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 3 }}>
              {allStocks.filter(s => s.totalDividends > 0).length > 0
                ? `${allStocks.filter(s => s.totalDividends > 0).length} 檔有配息紀錄`
                : '尚無配息紀錄'}
            </div>
          </div>
        </div>

        {/* Tab + 新增按鈕 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className={`tab${activeTab === 'tw' ? ' active' : ''}`} onClick={() => setActiveTab('tw')}>台股</button>
          <button className={`tab${activeTab === 'us' ? ' active' : ''}`} onClick={() => setActiveTab('us')}>美股</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setShowAddStock(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#2C2820', color: 'white',
              border: 'none', borderRadius: 10,
              padding: '7px 14px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Plus size={14} />
            新增持股
          </button>
        </div>

        {/* 持股列表 */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: '#9E9087' }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : currentStocks.length > 0 ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {currentStocks.map(stock => (
              <StockRow
                key={stock.id}
                stock={stock}
                onAddInvestment={setAddInvFor}
                onPriceUpdated={handlePriceUpdated}
                onAdjust={setAdjustFor}
                onAddDividend={setAddDivFor}
              />
            ))}
          </div>
        ) : (
          <div style={{
            borderRadius: 12, padding: '32px 14px', textAlign: 'center',
            background: '#F0EAE0', border: '1px solid rgba(180,160,130,0.3)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 13, color: '#9E9087' }}>
              尚無{activeTab === 'tw' ? '台股' : '美股'}持股，點右上角「新增持股」開始記錄
            </div>
          </div>
        )}

      </div>

      {/* Modals */}
      {showAddStock && (
        <AddStockModal
          onClose={() => setShowAddStock(false)}
          onSaved={handleStockSaved}
        />
      )}
      {addInvFor && (
        <AddInvestmentModal
          stock={addInvFor}
          onClose={() => setAddInvFor(null)}
          onSaved={handleInvestmentSaved}
        />
      )}
      {adjustFor && (
        <AdjustSharesModal
          stock={adjustFor}
          onClose={() => setAdjustFor(null)}
          onAdjusted={(n) => handleAdjusted(adjustFor.id, n)}
        />
      )}
      {addDivFor && (
        <AddDividendModal
          stock={addDivFor}
          onClose={() => setAddDivFor(null)}
          onSaved={handleDividendSaved}
        />
      )}

      {/* Toast */}
      {toast && <Toast type={toast.type} msg={toast.msg} />}
    </div>
  )
}
