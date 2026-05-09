# Molly's 記帳本 — 修復指令集

> **重要安全限制（Claude Code 必須嚴格遵守）**
> - ❌ 絕對不可修改任何 DNS 設定、hosts 檔案、網路介面設定
> - ❌ 絕對不可修改 `/etc/hosts`、`/etc/resolv.conf`、任何 `.env` 裡的 `VITE_SUPABASE_URL` 網域
> - ❌ 絕對不可執行任何影響系統網路或其他網頁可用性的指令
> - ✅ 只修改 `src/` 目錄下的 TypeScript/TSX 原始碼
> - ✅ 只在 Supabase Dashboard SQL Editor 執行 SQL（透過 Supabase MCP）
> - ✅ Git commit & push 完成後即結束，不做任何部署設定變更

---

## 執行前檢查

```bash
# 確認工作目錄正確
cd "C:\Users\王怡媃\Desktop\Claude code\recordmoney"
git config user.name "WB-Buyer"
git config user.email "win29989@gmail.com"
```

---

## 修復項目總覽

| # | 問題 | 修改範圍 |
|---|------|----------|
| 1 | 所有記錄無法儲存（RLS 403） | Supabase SQL（透過 MCP） |
| 2 | 設定頁左下角移除 Molly/email | `src/App.tsx` 或 layout 元件 |
| 3 | 儲蓄目標→帳戶總覽（6帳戶） | `src/pages/SavingsPage.tsx` 全部重寫 |
| 4 | 股票現價無法自動取得 | `supabase/functions/stock-search/index.ts` |
| 5 | 新增持股自動連動帳戶扣款 | `src/pages/StatsPage.tsx` |
| 6 | 投入記錄新增手續費欄位 | `src/pages/StatsPage.tsx` |
| 7 | 所有記錄可編輯（含帳戶餘額） | `src/pages/SavingsPage.tsx`（帳戶餘額編輯） |
| 8 | 記帳頁新增「帳單總覽」子頁面 | `src/pages/AddPage.tsx` |
| 9 | iPhone PWA Magic Link 登入問題 | `src/pages/SettingsPage.tsx` 改用 OTP |

---

## 修復 1：Supabase RLS 政策（最優先）

使用 Supabase MCP 工具執行以下 SQL，專案 ID 為 `mnhcukfrslvqbeyzyref`：

```sql
-- 清除 transactions 舊有 RLS 政策（忽略不存在的政策錯誤）
DO $$ 
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON transactions', pol.policyname);
  END LOOP;
END $$;

-- 確保 RLS 啟用
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- 建立正確的 4 條政策
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE USING (auth.uid() = user_id);

-- 同樣修復 bank_accounts 表（帳戶總覽需要）
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'TWD',
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DO $$ 
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'bank_accounts'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bank_accounts', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "bank_accounts_select" ON bank_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "bank_accounts_insert" ON bank_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bank_accounts_update" ON bank_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "bank_accounts_delete" ON bank_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- 修復 stock_investments 表 RLS（若存在）
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_investments') THEN
    EXECUTE 'ALTER TABLE stock_investments ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- 修復 stocks 表 RLS（允許已登入用戶讀取所有股票，寫入需 user_id）
DO $$ 
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'stocks'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON stocks', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stocks_select" ON stocks
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "stocks_insert" ON stocks
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "stocks_update" ON stocks
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "stocks_delete" ON stocks
  FOR DELETE USING (auth.uid() IS NOT NULL);
```

---

## 修復 2：移除設定頁左下角 Molly/email 顯示

在 `src/App.tsx`（或 `src/components/Layout.tsx`、`src/components/Sidebar.tsx`）中找到以下模式的 JSX 並刪除整個區塊：

**搜尋目標**（找包含這些關鍵字的 JSX 區塊）：
- `win29989@gmail.com`
- `Molly` 與 email 同時出現在一個 `<div>` 或 `<footer>` 裡
- 位於側邊欄底部的 user info 區塊

**刪除規則**：找到類似以下結構的整個 `<div>` 或 `<footer>` 區塊並移除（從最外層包含 email 的容器刪除）：

```tsx
// 刪除這整個區塊（名稱可能略有不同）
<div style={{ ... /* bottom user info */ }}>
  <div>Molly</div>
  <div>win29989@gmail.com</div>
</div>
```

---

## 修復 3：SavingsPage → 帳戶總覽頁

將 `src/pages/SavingsPage.tsx` **整個內容替換**為以下程式碼：

```tsx
import { useState, useEffect } from 'react'
import { Pencil, Check, X, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'

// ─── 帳戶定義 ─────────────────────────────────────────────────
interface BankAccount {
  id: string
  name: string
  currency: 'TWD' | 'USD'
  balance: number
}

const DEFAULT_ACCOUNTS: Omit<BankAccount, 'id'>[] = [
  { name: '台新 Richart',  currency: 'TWD', balance: 0 },
  { name: '台新薪轉',      currency: 'TWD', balance: 0 },
  { name: '國泰 Cube',     currency: 'TWD', balance: 0 },
  { name: '國泰美金',      currency: 'USD', balance: 0 },
  { name: '永豐大戶',      currency: 'TWD', balance: 0 },
  { name: '玉山',          currency: 'TWD', balance: 0 },
  { name: '富邦',          currency: 'TWD', balance: 0 },
]

// ─── Toast ─────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
      background: type === 'ok' ? '#5E9B6A' : '#C0554A',
      color: '#fff', padding: '12px 20px', borderRadius: 99,
      fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', zIndex: 600,
    }}>{msg}</div>
  )
}

// ─── 單一帳戶列 ────────────────────────────────────────────────
function AccountRow({
  account,
  onSave,
}: {
  account: BankAccount
  onSave: (id: string, balance: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(String(account.balance))
  const [saving, setSaving]   = useState(false)

  async function handleConfirm() {
    const n = parseFloat(val)
    if (isNaN(n)) { setVal(String(account.balance)); setEditing(false); return }
    setSaving(true)
    await onSave(account.id, n)
    setSaving(false)
    setEditing(false)
  }

  const symbol = account.currency === 'USD' ? 'USD ' : '$'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid rgba(180,160,130,0.2)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2C2820' }}>{account.name}</div>
        <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2 }}>{account.currency}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <>
            <input
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              style={{
                width: 120, padding: '6px 10px', borderRadius: 8,
                border: '1.5px solid #DDD5C8', background: '#FAF6F0',
                fontSize: 14, fontFamily: 'inherit', textAlign: 'right',
              }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') setEditing(false) }}
            />
            <button
              onClick={handleConfirm}
              disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5E9B6A', padding: 4 }}
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => { setVal(String(account.balance)); setEditing(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0554A', padding: 4 }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>
              {symbol}{account.balance.toLocaleString()}
            </span>
            <button
              onClick={() => { setVal(String(account.balance)); setEditing(true) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9087', padding: 4 }}
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── SavingsPage 主元件（帳戶總覽）────────────────────────────
export default function SavingsPage() {
  const [accounts, setAccounts]   = useState<BankAccount[]>([])
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2400)
  }

  // 載入帳戶（從 Supabase 或 localStorage fallback）
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          // 未登入：使用 localStorage
          const raw = localStorage.getItem('bank_accounts')
          if (raw) {
            setAccounts(JSON.parse(raw))
          } else {
            const defaults = DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: String(i + 1) }))
            setAccounts(defaults)
            localStorage.setItem('bank_accounts', JSON.stringify(defaults))
          }
          return
        }

        // 已登入：從 Supabase 取得
        const { data, error } = await supabase
          .from('bank_accounts')
          .select('*')
          .order('created_at')

        if (error) throw error

        if (!data || data.length === 0) {
          // 第一次使用：插入預設帳戶
          const toInsert = DEFAULT_ACCOUNTS.map(a => ({ ...a, user_id: user.id }))
          const { data: inserted, error: insertErr } = await supabase
            .from('bank_accounts')
            .insert(toInsert)
            .select()
          if (insertErr) throw insertErr
          setAccounts(inserted ?? [])
        } else {
          setAccounts(data)
        }
      } catch (e: any) {
        // fallback to localStorage
        const raw = localStorage.getItem('bank_accounts')
        if (raw) {
          setAccounts(JSON.parse(raw))
        } else {
          const defaults = DEFAULT_ACCOUNTS.map((a, i) => ({ ...a, id: String(i + 1) }))
          setAccounts(defaults)
        }
        console.warn('bank_accounts load error:', e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave(id: string, balance: number) {
    // 更新 local state
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance } : a))

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error } = await supabase
          .from('bank_accounts')
          .update({ balance, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      } else {
        // 未登入：存 localStorage
        const updated = accounts.map(a => a.id === id ? { ...a, balance } : a)
        localStorage.setItem('bank_accounts', JSON.stringify(updated))
      }
      showToast('餘額已更新')
    } catch (e: any) {
      showToast('儲存失敗：' + e.message, 'err')
    }
  }

  const twdAccounts = accounts.filter(a => a.currency === 'TWD')
  const usdAccounts = accounts.filter(a => a.currency === 'USD')
  const totalTWD    = twdAccounts.reduce((s, a) => s + a.balance, 0)
  const totalUSD    = usdAccounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="page-title">
        <span>帳戶總覽</span>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 總計 summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>台幣帳戶總計</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820' }}>${totalTWD.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>{twdAccounts.length} 個帳戶</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>美金帳戶總計</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820' }}>USD {totalUSD.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>{usdAccounts.length} 個帳戶</div>
          </div>
        </div>

        {/* 台幣帳戶 */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5E52', marginBottom: 4 }}>🏦 台幣帳戶</div>
          {loading ? (
            <div style={{ fontSize: 12, color: '#9E9087', padding: '12px 0' }}>載入中...</div>
          ) : (
            twdAccounts.map(a => (
              <AccountRow key={a.id} account={a} onSave={handleSave} />
            ))
          )}
        </div>

        {/* 美金帳戶 */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5E52', marginBottom: 4 }}>💵 美金帳戶</div>
          {loading ? (
            <div style={{ fontSize: 12, color: '#9E9087', padding: '12px 0' }}>載入中...</div>
          ) : (
            usdAccounts.map(a => (
              <AccountRow key={a.id} account={a} onSave={handleSave} />
            ))
          )}
        </div>

        {/* 說明 */}
        <div style={{
          background: 'rgba(221,213,200,0.3)', borderRadius: 10,
          padding: '10px 14px', fontSize: 11, color: '#9E9087',
        }}>
          點擊鉛筆圖示可直接編輯各帳戶餘額。匯款/轉帳記帳時會從對應帳戶自動扣款。
        </div>

      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
```

---

## 修復 4：股票現價 Edge Function

修改 `supabase/functions/stock-search/index.ts`，替換整個檔案內容：

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 台股靜態名稱對照（常用標的）
const TW_NAMES: Record<string, string> = {
  '2330': '台積電', '2317': '鴻海', '2454': '聯發科', '2308': '台達電',
  '2382': '廣達', '2303': '聯電', '2412': '中華電', '1301': '台塑',
  '1303': '南亞', '2002': '中鋼', '0050': '元大台灣50', '0056': '元大高股息',
  '00878': '國泰永續高股息', '00929': '復華台灣科技優息', '00919': '群益台灣精選高息',
  '3008': '大立光', '2395': '研華', '5880': '合庫金', '2884': '玉山金',
  '2882': '國泰金', '2886': '兆豐金', '2891': '中信金', '2892': '第一金',
  '2880': '華南金', '2885': '元大金', '2890': '永豐金', '2881': '富邦金',
  '1216': '統一', '2912': '統一超', '3711': '日月光投控', '2357': '華碩',
  '2379': '瑞昱', '4938': '和碩', '2474': '可成', '3045': '台灣大',
  '4904': '遠傳', '2408': '南亞科', '2337': '旺宏', '3034': '聯詠',
}

// 美股靜態名稱對照
const US_NAMES: Record<string, string> = {
  'NVDA': 'NVIDIA', 'AAPL': 'Apple', 'MSFT': 'Microsoft', 'GOOGL': 'Alphabet',
  'AMZN': 'Amazon', 'META': 'Meta', 'TSLA': 'Tesla', 'TSM': '台積電ADR',
  'AVGO': 'Broadcom', 'AMD': 'AMD', 'INTC': 'Intel', 'QCOM': 'Qualcomm',
  'MU': 'Micron', 'AMAT': 'Applied Materials', 'ASML': 'ASML',
  'SPY': 'S&P500 ETF', 'QQQ': 'Nasdaq ETF', 'VTI': 'Vanguard Total',
  'ARKK': 'ARK Innovation', 'SOXX': 'iShares Semiconductor',
}

// Yahoo Finance v8 取得現價
async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

// 備援：Yahoo Finance v10
async function fetchYahooV10Price(symbol: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const price = json?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw
    return typeof price === 'number' ? price : null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { symbol, market } = await req.json()
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'symbol required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const sym = symbol.trim().toUpperCase()
    const isTW = market === 'TW'

    // 靜態名稱
    const staticName = isTW ? TW_NAMES[sym] : US_NAMES[sym]

    // Yahoo Finance 代號（台股加 .TW）
    const yahooSym = isTW ? `${sym}.TW` : sym

    // 嘗試取得現價（v8 優先，v10 備援）
    let price = await fetchYahooPrice(yahooSym)
    if (!price || price <= 0) {
      price = await fetchYahooV10Price(yahooSym)
    }

    return new Response(
      JSON.stringify({
        symbol: sym,
        name: staticName ?? sym,
        price: price ?? 0,
        source: price ? 'yahoo' : 'fallback',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

部署 Edge Function（在專案目錄下執行）：

```bash
.\supabase.exe functions deploy stock-search --project-ref mnhcukfrslvqbeyzyref --no-verify-jwt
```

---

## 修復 5 & 6：StatsPage — 持股帳戶連動 + 手續費欄位

在 `src/pages/StatsPage.tsx` 中找到 `AddStockModal` 元件，進行以下修改：

### 5a. 在 `invRows` 的型別中新增 `fee` 欄位

找到：
```typescript
const [invRows, setInvRows] = useState([
  { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', source: '老婆' as Source }
])
```

替換為：
```typescript
const [invRows, setInvRows] = useState([
  { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', fee: '', source: '老婆' as Source }
])
```

### 5b. 更新 `addInvRow` 函數

找到：
```typescript
function addInvRow() {
  setInvRows(prev => [...prev, { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', source: '老婆' }])
}
```

替換為：
```typescript
function addInvRow() {
  setInvRows(prev => [...prev, { date: format(new Date(), 'yyyy-MM-dd'), qty: '', cost: '', fee: '', source: '老婆' as Source }])
}
```

### 5c. 更新 `totalCost` 計算（加入手續費）

找到：
```typescript
const totalCost   = invRows.reduce((s, r) => {
  const sh = qtyToShares(r.qty)
  const co = parseFloat(r.cost)
  return s + (isNaN(co) ? 0 : sh * co)
}, 0)
```

替換為：
```typescript
const totalCost   = invRows.reduce((s, r) => {
  const sh  = qtyToShares(r.qty)
  const co  = parseFloat(r.cost)
  const fee = parseFloat(r.fee) || 0
  return s + (isNaN(co) ? 0 : sh * co) + fee
}, 0)
```

### 5d. 在 Step 3（投入記錄）UI 中新增手續費欄位

在 Step 3 的 invRows.map 裡，找到成本價輸入欄位之後，新增手續費欄位。

找到每一列中類似：
```tsx
<input
  className="finp"
  type="number"
  min="0"
  step="0.01"
  placeholder="成本價"
  value={r.cost}
  onChange={e => updateInvRow(idx, 'cost', e.target.value)}
/>
```

在其後方加入：
```tsx
<input
  className="finp"
  type="number"
  min="0"
  step="1"
  placeholder="手續費（選填）"
  value={r.fee}
  onChange={e => updateInvRow(idx, 'fee', e.target.value)}
  style={{ marginTop: 6 }}
/>
<div style={{ fontSize: 10, color: '#9E9087' }}>手續費</div>
```

### 5e. 在 Step 5（確認儲存）顯示總投入含手續費

找到步驟 5 裡顯示總投入金額的區塊，確保顯示的是含手續費的 `totalCost`（已在 5c 修改過計算邏輯，此處自動生效）。

在總投入金額顯示下方新增明細說明：

找到類似：
```tsx
<div>投入總額：{currSymbol}{totalCost.toLocaleString()}</div>
```

替換為：
```tsx
<div>
  <div>投入總額（含手續費）：{currSymbol}{totalCost.toLocaleString()}</div>
  {invRows.some(r => parseFloat(r.fee) > 0) && (
    <div style={{ fontSize: 11, color: '#9E9087', marginTop: 4 }}>
      含手續費：{currSymbol}{invRows.reduce((s, r) => s + (parseFloat(r.fee) || 0), 0).toLocaleString()}
    </div>
  )}
</div>
```

### 5f. handleSave 中新增帳戶扣款邏輯

在 `handleSave` 函數中，找到 `insertInvestment` 迴圈之後，新增帳戶扣款：

找到：
```typescript
for (const inv of invPayloads) {
  await insertInvestment(inv)
}
onSaved(saved, invPayloads)
```

替換為：
```typescript
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
```

---

## 修復 8：記帳頁新增「帳單總覽」子頁面

在 `src/pages/AddPage.tsx` 中找到 Tab 列表定義的地方（通常是 `tabs` 陣列或 Tab 按鈕列表），新增「帳單總覽」Tab。

### 8a. 找到 Tab 導覽列

找到類似以下的 Tab 切換 UI（可能在 `AddPage` export 的 return 裡）：

```tsx
// 原本可能有：手動記帳、消費明細、帳單管理
```

新增 Tab 按鈕：帳單總覽（放在帳單管理之後）

### 8b. 新增 `BillSummaryTab` 元件

在 `src/pages/AddPage.tsx` 檔案的末尾（export default 之前），新增以下元件：

```tsx
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
            {/* 分類明細 */}
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
```

### 8c. 在 Tab 切換邏輯中加入 `BillSummaryTab`

找到 AddPage 中的 `activeTab` 狀態和 Tab 渲染邏輯，新增第 4 個 Tab：

在 Tab 按鈕列新增：
```tsx
{ key: 'bill-summary', label: '帳單總覽' }
```

在內容渲染區域新增：
```tsx
{activeTab === 'bill-summary' && <BillSummaryTab />}
```

---

## 修復 9：iPhone PWA 登入問題 — 改用 OTP 驗證碼

在 `src/pages/SettingsPage.tsx` 中，將 `MagicLinkSection` 元件整個替換為 OTP 驗證碼流程：

找到整個 `MagicLinkSection` 函數（從 `function MagicLinkSection` 到其對應的 `}`），替換為：

```tsx
// ─── OTP 驗證碼登入（解決 iPhone PWA Magic Link 問題）────────
function MagicLinkSection({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [email, setEmail]     = useState('')
  const [otp, setOtp]         = useState('')
  const [step, setStep]       = useState<'email' | 'otp'>('email')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSendOtp() {
    if (!email.trim()) { onToast('err', '請輸入 Email'); return }
    setSending(true)
    // 使用 OTP 模式（不發送連結，發送 6 位數驗證碼）
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setSending(false)
    if (error) { onToast('err', '發送失敗：' + error.message); return }
    setStep('otp')
    onToast('ok', '驗證碼已發送，請查收信箱')
  }

  async function handleVerifyOtp() {
    if (!otp.trim() || otp.length < 6) { onToast('err', '請輸入 6 位數驗證碼'); return }
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setVerifying(false)
    if (error) { onToast('err', '驗證失敗：' + error.message); return }
    onToast('ok', '登入成功！')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUserEmail(null)
    setStep('email')
    setEmail('')
    setOtp('')
    onToast('ok', '已登出')
  }

  // 已登入：顯示帳號與登出按鈕
  if (userEmail) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2820', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} style={{ color: '#5E9B6A' }} /> 已登入
          </div>
          <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2 }}>{userEmail}</div>
        </div>
        <button
          className="sbtn"
          onClick={handleSignOut}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 10px' }}
        >
          <LogOut size={13} /> 登出
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820' }}>
        登入以備份雲端
      </div>
      <div style={{ fontSize: 11, color: '#9E9087' }}>
        使用驗證碼登入，完全支援 iPhone 主畫面 PWA ✅
      </div>

      {step === 'email' ? (
        <>
          <input
            className="finp"
            type="email"
            placeholder="請輸入 Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
          />
          <button
            className="save-btn"
            style={{ background: '#2C2820', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleSendOtp}
            disabled={sending}
          >
            <Mail size={15} /> {sending ? '發送中...' : '發送驗證碼'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#5E9B6A', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={14} /> 驗證碼已發送至 {email}
          </div>
          <input
            className="finp"
            type="number"
            placeholder="輸入 6 位數驗證碼"
            value={otp}
            maxLength={6}
            onChange={e => setOtp(e.target.value.slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
            style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20, fontWeight: 700 }}
          />
          <button
            className="save-btn"
            style={{ background: '#2C2820', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleVerifyOtp}
            disabled={verifying}
          >
            <LogIn size={15} /> {verifying ? '驗證中...' : '確認登入'}
          </button>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#9E9087', textDecoration: 'underline',
            }}
            onClick={() => { setStep('email'); setOtp('') }}
          >
            重新發送 / 更改 Email
          </button>
        </>
      )}
    </div>
  )
}
```

---

## 最終步驟：Git Commit & Push

所有修改完成後執行：

```bash
cd "C:\Users\王怡媃\Desktop\Claude code\recordmoney"
git config user.name "WB-Buyer"
git config user.email "win29989@gmail.com"
git add -A
git commit -m "fix: RLS修復/帳戶總覽/OTP登入/手續費/帳單總覽/股票現價"
git push origin main
```

---

## 驗證清單

Push 完成後，等待 Vercel 自動部署（約 1-2 分鐘），然後逐一驗證：

- [ ] 手動記帳可以儲存（問題1）
- [ ] 設定頁左下角無 email 顯示（問題2）
- [ ] 底部導覽「目標」頁改為帳戶總覽，可看到 7 個帳戶並編輯餘額（問題3）
- [ ] 新增持股時股票現價自動填入（問題4）
- [ ] 台股投入後永豐帳戶餘額自動扣減（問題5）
- [ ] 新增持股步驟 3 有「手續費」輸入欄（問題6）
- [ ] 帳戶餘額可點擊鉛筆圖示編輯（問題7）
- [ ] 記帳頁有「帳單總覽」Tab 顯示各卡費用（問題8）
- [ ] iPhone PWA 用驗證碼登入，不再需要點 Magic Link（問題9）
