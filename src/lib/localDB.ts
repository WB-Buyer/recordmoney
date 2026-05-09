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
