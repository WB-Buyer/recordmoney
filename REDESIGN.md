# Molly's 記帳本 — Local-First 架構重新設計

> **安全限制（必須嚴格遵守）**
> - ❌ 不可修改 DNS、hosts 檔案、任何網路設定
> - ❌ 不可修改 `.env` 裡的任何值
> - ✅ 只修改 `src/` 目錄下的程式碼
> - ✅ Supabase SQL 透過 MCP 執行
> - ✅ 完成後 git commit & push

---

## 設計目標

**核心原則：資料優先存在手機本地（localStorage），Supabase 只做雲端備份。**

- 不需要登入也能完整使用所有功能
- 登入只需要做一次，session 維持 180 天
- 快到期前 10 天在 App 內提醒續期
- 所有操作瞬間反應，不等網路
- 背景靜默同步到雲端，使用者感覺不到

---

## 執行前準備

```bash
cd "C:\Users\王怡媃\Desktop\Claude code\recordmoney"
git config user.name "WB-Buyer"
git config user.email "win29989@gmail.com"
```

---

## Step 1：建立核心本地資料層

建立新檔案 `src/lib/localDB.ts`，這是所有資料操作的統一入口：

```typescript
// src/lib/localDB.ts
// ─── Local-First 資料層 ───────────────────────────────────────
// 所有資料優先讀寫 localStorage，背景同步 Supabase

const KEYS = {
  TRANSACTIONS: 'mlk_transactions',
  ACCOUNTS:     'mlk_accounts',
  STOCKS:       'mlk_stocks',
  INVESTMENTS:  'mlk_investments',
  DIVIDENDS:    'mlk_dividends',
  CREDIT_CARDS: 'mlk_credit_cards',
  CATEGORIES:   'mlk_categories',
  SESSION_EXP:  'mlk_session_exp',
  LAST_SYNC:    'mlk_last_sync',
}

// ─── 通用讀寫 ─────────────────────────────────────────────────
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function write<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 容量不足時忽略 */ }
}

// ─── 型別定義 ─────────────────────────────────────────────────
export interface LocalTransaction {
  id: string
  date: string
  amount: number
  type: 'expense' | 'income'
  category: string
  subcategory: string
  payment_method: string
  payment: string
  note: string
  credit_card_id: string | null
  bank_account_id: string | null
  source: string
  synced: boolean       // 是否已同步到 Supabase
  created_at: string
  updated_at: string
}

export interface LocalAccount {
  id: string
  name: string
  currency: 'TWD' | 'USD'
  balance: number
  synced: boolean
  updated_at: string
}

// ─── 預設帳戶 ─────────────────────────────────────────────────
const DEFAULT_ACCOUNTS: LocalAccount[] = [
  { id: 'acc-1', name: '台新 Richart',  currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-2', name: '台新薪轉',      currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-3', name: '國泰 Cube',     currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-4', name: '國泰美金',      currency: 'USD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-5', name: '永豐大戶',      currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-6', name: '玉山',          currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
  { id: 'acc-7', name: '富邦',          currency: 'TWD', balance: 0, synced: false, updated_at: new Date().toISOString() },
]

// ─── 交易記錄 CRUD ────────────────────────────────────────────
export function getTransactions(): LocalTransaction[] {
  return read<LocalTransaction[]>(KEYS.TRANSACTIONS, [])
}

export function addTransaction(tx: Omit<LocalTransaction, 'id' | 'synced' | 'created_at' | 'updated_at'>): LocalTransaction {
  const now = new Date().toISOString()
  const newTx: LocalTransaction = {
    ...tx,
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    synced: false,
    created_at: now,
    updated_at: now,
  }
  const list = getTransactions()
  list.unshift(newTx)
  write(KEYS.TRANSACTIONS, list)
  // 背景同步
  syncTransactionToSupabase(newTx).catch(() => {})
  return newTx
}

export function updateTransaction(id: string, changes: Partial<LocalTransaction>): void {
  const list = getTransactions().map(tx =>
    tx.id === id ? { ...tx, ...changes, synced: false, updated_at: new Date().toISOString() } : tx
  )
  write(KEYS.TRANSACTIONS, list)
  const updated = list.find(t => t.id === id)
  if (updated) syncTransactionToSupabase(updated).catch(() => {})
}

export function deleteTransaction(id: string): void {
  const list = getTransactions().filter(tx => tx.id !== id)
  write(KEYS.TRANSACTIONS, list)
  deleteTransactionFromSupabase(id).catch(() => {})
}

export function getTransactionsByMonth(year: number, month: number): LocalTransaction[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return getTransactions().filter(tx => tx.date.startsWith(prefix))
}

// ─── 帳戶 CRUD ────────────────────────────────────────────────
export function getAccounts(): LocalAccount[] {
  const stored = read<LocalAccount[]>(KEYS.ACCOUNTS, [])
  if (stored.length === 0) {
    write(KEYS.ACCOUNTS, DEFAULT_ACCOUNTS)
    return DEFAULT_ACCOUNTS
  }
  return stored
}

export function updateAccountBalance(id: string, balance: number): void {
  const list = getAccounts().map(a =>
    a.id === id ? { ...a, balance, synced: false, updated_at: new Date().toISOString() } : a
  )
  write(KEYS.ACCOUNTS, list)
  const updated = list.find(a => a.id === id)
  if (updated) syncAccountToSupabase(updated).catch(() => {})
}

export function deductFromAccount(accountName: string, amount: number): void {
  const accounts = getAccounts()
  const target = accounts.find(a => a.name === accountName)
  if (target) updateAccountBalance(target.id, target.balance - amount)
}

// ─── Session 到期管理 ─────────────────────────────────────────
const SESSION_DAYS = 180
const WARN_DAYS_BEFORE = 10

export function setSessionExpiry(): void {
  const exp = new Date()
  exp.setDate(exp.getDate() + SESSION_DAYS)
  write(KEYS.SESSION_EXP, exp.toISOString())
}

export function getSessionDaysLeft(): number | null {
  const expStr = read<string | null>(KEYS.SESSION_EXP, null)
  if (!expStr) return null
  const exp = new Date(expStr)
  const now = new Date()
  const diff = Math.ceil((exp.getTime() - now.getTime()) / 86400000)
  return diff
}

export function shouldWarnSessionExpiry(): boolean {
  const days = getSessionDaysLeft()
  if (days === null) return false
  return days <= WARN_DAYS_BEFORE && days > 0
}

export function isSessionExpired(): boolean {
  const days = getSessionDaysLeft()
  if (days === null) return false
  return days <= 0
}

// ─── Supabase 背景同步函數 ────────────────────────────────────
// 這些函數在背景執行，失敗不影響本地操作

async function syncTransactionToSupabase(tx: LocalTransaction): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 把本地 category 名稱轉成 category_id
    const { data: cats } = await supabase.from('categories').select('id, name')
    const catMap: Record<string, string> = {}
    ;(cats ?? []).forEach((c: any) => { catMap[c.name] = c.id })

    const payload = {
      id: tx.id.startsWith('tx-') ? undefined : tx.id, // 本地 ID 不帶入（讓 DB 自己生）
      user_id: user.id,
      date: tx.date,
      amount: tx.amount,
      type: tx.type,
      category_id: catMap[tx.category] ?? null,
      sub_category_id: null,
      payment_method: tx.payment_method,
      note: tx.note || null,
      credit_card_id: tx.credit_card_id,
      source: tx.source || 'manual',
    }

    await supabase.from('transactions').upsert(payload, { onConflict: 'id' })

    // 標記為已同步
    const list = getTransactions().map(t =>
      t.id === tx.id ? { ...t, synced: true } : t
    )
    write(KEYS.TRANSACTIONS, list)
  } catch {
    // 靜默失敗，下次再試
  }
}

async function deleteTransactionFromSupabase(id: string): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('transactions').delete().eq('id', id).eq('user_id', user.id)
  } catch { /* 靜默失敗 */ }
}

async function syncAccountToSupabase(account: LocalAccount): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('bank_accounts').upsert({
      id: account.id.startsWith('acc-') ? undefined : account.id,
      user_id: user.id,
      name: account.name,
      currency: account.currency,
      balance: account.balance,
      updated_at: account.updated_at,
    }, { onConflict: 'id' })
  } catch { /* 靜默失敗 */ }
}

// ─── 登入後從雲端拉取資料（合併到本地）────────────────────────
export async function pullFromSupabase(): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 拉取帳戶
    const { data: remoteAccounts } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)

    if (remoteAccounts && remoteAccounts.length > 0) {
      const mapped: LocalAccount[] = remoteAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: a.balance,
        synced: true,
        updated_at: a.updated_at,
      }))
      // 合併：以雲端資料為主，保留本地有但雲端沒有的
      const local = getAccounts()
      const remoteIds = new Set(mapped.map(a => a.id))
      const localOnly = local.filter(a => !remoteIds.has(a.id) && !a.id.startsWith('acc-'))
      write(KEYS.ACCOUNTS, [...mapped, ...localOnly])
    }

    // 標記 session 到期時間
    setSessionExpiry()

    write(KEYS.LAST_SYNC, new Date().toISOString())
  } catch { /* 靜默失敗 */ }
}

// ─── 推送所有未同步資料到雲端 ─────────────────────────────────
export async function pushUnsyncedToSupabase(): Promise<void> {
  const unsynced = getTransactions().filter(tx => !tx.synced)
  for (const tx of unsynced) {
    await syncTransactionToSupabase(tx)
  }
}
```

---

## Step 2：修改 Supabase 客戶端設定（延長 Session）

找到 `src/lib/supabase.ts`，在 `createClient` 的呼叫裡加入 session 持久化設定。

找到類似：
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

替換為：
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'mlk_auth',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
```

---

## Step 3：修改 AddPage.tsx — 儲存改走本地

在 `src/pages/AddPage.tsx` 中找到 `handleSave` 函數，替換整個函數：

找到：
```typescript
async function handleSave() {
  const num = parseAmount(amountStr)
  if (!num) { showToast('err', '請輸入有效金額'); return }
  setLoading(true)
  try {
    // 信用卡付款時查詢 credit_card_id
    let credit_card_id: string | null = null
    if (type === 'expense' && payment === 'credit') {
      const { data: cards } = await supabase.from('credit_cards').select('id, card_name')
      const match = (cards ?? []).find((c: { id: string; card_name: string }) => c.card_name === cardName)
      credit_card_id = match?.id ?? null
    }

    const payload: ExpenseInsert = {
      date,
      category: type === 'income' ? incomeCat : category,
      subcategory: type === 'income' ? '' : subcategory,
      amount: num,
      type,
      payment_method: type === 'income' ? 'cash' : payment,
      payment: type === 'income'
        ? incomeAccount
        : payment === 'credit' ? cardName
        : payment === 'transfer' ? account
        : '現金',
      credit_card_id,
    }
    if (note) payload.note = note
    await addTransaction(payload)
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
```

替換為：
```typescript
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
      type,
      category: type === 'income' ? incomeCat : category,
      subcategory: type === 'income' ? '' : subcategory,
      payment_method: type === 'income' ? 'cash' : payment,
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
```

同時在檔案頂部移除舊的 `import { getTransactions, addTransaction, removeTransaction, editTransaction } from '../lib/storage'`，改用 localDB。

---

## Step 4：修改 SavingsPage.tsx（帳戶總覽）— 改走本地

將 `src/pages/SavingsPage.tsx` 的 `useEffect` 載入邏輯和 `handleSave` 改為使用 `localDB`：

找到整個 `useEffect` 載入帳戶的部分，替換為：

```typescript
useEffect(() => {
  // 直接從本地讀取，立即顯示
  const { getAccounts, pullFromSupabase } = require('../lib/localDB')
  const local = getAccounts()
  setAccounts(local)
  setLoading(false)

  // 背景從雲端更新（有登入才執行）
  pullFromSupabase().then(() => {
    const updated = getAccounts()
    setAccounts(updated)
  }).catch(() => {})
}, [])
```

找到 `handleSave` 函數，替換為：

```typescript
async function handleSave(id: string, balance: number) {
  const { updateAccountBalance } = await import('../lib/localDB')
  updateAccountBalance(id, balance)
  setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance } : a))
  showToast('餘額已更新')
}
```

---

## Step 5：修改 RecordsPage（消費明細）— 改走本地

在 `src/pages/AddPage.tsx` 找到消費明細 Tab（RecordsTab 或類似名稱），把讀取交易記錄的邏輯改為：

```typescript
// 從本地讀取，立即顯示
import { getTransactionsByMonth, deleteTransaction, updateTransaction } from '../lib/localDB'

// 讀取當月記錄
const records = getTransactionsByMonth(year, month)
```

---

## Step 6：修改 App.tsx — 登入後觸發雲端同步 + Session 到期提醒

在 `src/App.tsx`（或主 Layout 元件）中：

### 6a. 監聽登入事件，登入後同步

找到 `supabase.auth.onAuthStateChange` 或 App 初始化的地方，加入：

```typescript
import { pullFromSupabase, pushUnsyncedToSupabase, setSessionExpiry } from './lib/localDB'

// 在 useEffect 或 App 初始化時
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    setSessionExpiry()
    // 先推送本地未同步的資料
    await pushUnsyncedToSupabase()
    // 再從雲端拉取最新資料
    await pullFromSupabase()
  }
})
```

### 6b. Session 到期提醒橫條

在主 Layout 的 JSX 最頂部加入提醒橫條元件：

```typescript
import { shouldWarnSessionExpiry, isSessionExpired, getSessionDaysLeft } from './lib/localDB'

function SessionWarningBar() {
  const [show, setShow] = useState(false)
  const [days, setDays] = useState<number | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const d = getSessionDaysLeft()
    setDays(d)
    setShow(shouldWarnSessionExpiry() || isSessionExpired())
    setExpired(isSessionExpired())
  }, [])

  if (!show) return null

  return (
    <div style={{
      background: expired ? '#C0554A' : '#C8A96A',
      color: '#fff',
      padding: '8px 16px',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    }}>
      <span>
        {expired
          ? '☁️ 雲端備份已暫停，本機資料正常'
          : `☁️ 雲端備份將於 ${days} 天後到期`}
      </span>
      <button
        onClick={() => window.location.href = '/settings'}
        style={{
          background: 'rgba(255,255,255,0.25)',
          border: 'none', borderRadius: 6,
          color: '#fff', padding: '3px 10px',
          fontSize: 11, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {expired ? '重新連線' : '立即續期'}
      </button>
    </div>
  )
}
```

然後在 Layout 的 return 裡，在整個畫面最頂部加入 `<SessionWarningBar />`。

### 6c. 修改導覽列文字

找到導覽列中連結到 `/savings` 的項目，確保文字是「帳戶總覽」：

```typescript
// 找到類似這樣的 nav item
{ path: '/savings', label: '帳戶總覽', icon: ... }
// 確保 label 是「帳戶總覽」而不是「儲蓄目標」
```

---

## Step 7：修改 SettingsPage.tsx — OTP 登入後觸發同步

在 OTP 驗證成功後，確保會觸發同步：

找到 `handleVerifyOtp` 函數中驗證成功的部分：

```typescript
// 在 verifyOtp 成功後加入
const { setSessionExpiry, pushUnsyncedToSupabase, pullFromSupabase } = await import('../lib/localDB')
setSessionExpiry()
pushUnsyncedToSupabase().catch(() => {})
pullFromSupabase().catch(() => {})
onToast('ok', '登入成功！雲端資料同步中...')
```

---

## Step 8：Supabase SQL — 讓 transactions 接受本地格式

在 Supabase SQL Editor 執行（專案 ID：`mnhcukfrslvqbeyzyref`）：

```sql
-- 確保 transactions 的 user_id 有預設值處理
-- 讓 category_id 和 sub_category_id 允許 null
ALTER TABLE transactions 
  ALTER COLUMN category_id DROP NOT NULL,
  ALTER COLUMN sub_category_id DROP NOT NULL;

-- 確保 bank_accounts 有正確的 upsert 支援
ALTER TABLE bank_accounts 
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
```

---

## Step 9：清理舊的 storage.ts 依賴

在 `src/lib/storage.ts` 中，確保舊的 `addTransaction`、`getTransactions` 等函數仍然存在（為了向後相容），但在內部改為呼叫 `localDB.ts` 的對應函數，避免其他頁面出錯：

```typescript
// src/lib/storage.ts — 向後相容包裝層
export { 
  getTransactions, 
  addTransaction, 
  deleteTransaction as removeTransaction,
  updateTransaction as editTransaction,
} from './localDB'
```

---

## 最終步驟：Git Commit & Push

```bash
cd "C:\Users\王怡媃\Desktop\Claude code\recordmoney"
git config user.name "WB-Buyer"
git config user.email "win29989@gmail.com"
git add -A
git commit -m "refactor: Local-First架構/本地儲存/Session到期提醒/帳戶總覽修復"
git push origin main
```

---

## 完成後驗證清單

- [ ] 未登入也能記帳（立即儲存，無錯誤）
- [ ] 帳戶總覽顯示 7 個帳戶，可編輯餘額
- [ ] 導覽列顯示「帳戶總覽」
- [ ] 登入後雲端自動同步
- [ ] Session 快到期時頂部出現提醒橫條
- [ ] iPhone PWA 上記帳正常運作
