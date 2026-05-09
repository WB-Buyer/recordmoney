// 統一 Storage Helper
// 登入狀態 → 使用 Supabase；未登入 → 使用 localStorage

import { supabase, getRecords, insertRecord, deleteRecord, updateRecord, type ExpenseInsert } from './supabase'
import { CATEGORY_IDS, SUBCATEGORY_IDS } from './categories'

const isLoggedIn = async () => {
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

const LOCAL_KEYS = {
  transactions: 'molly_transactions',
  credit_cards: 'molly_credit_cards',
  stocks:       'molly_stocks',
  goals:        'molly_goals',
  categories:   'molly_categories',
}

const localGet = (key: keyof typeof LOCAL_KEYS) => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEYS[key]) ?? '[]') }
  catch { return [] }
}

const localSet = (key: keyof typeof LOCAL_KEYS, data: unknown) => {
  localStorage.setItem(LOCAL_KEYS[key], JSON.stringify(data))
}

// ── 讀取交易記錄 ──
export const getTransactions = async (year?: number, month?: number) => {
  if (await isLoggedIn()) {
    return getRecords(year, month)
  }
  const all: Record<string, unknown>[] = localGet('transactions')
  if (year && month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0)
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    return all.filter(r => (r.date as string) >= start && (r.date as string) <= endStr)
  }
  return all
}

// ── 新增交易記錄 ──
export const addTransaction = async (tx: ExpenseInsert) => {
  if (await isLoggedIn()) {
    return insertRecord(tx)
  }
  // 本機模式
  const pm = tx.payment_method === 'credit' ? 'credit_card'
    : tx.payment_method === 'transfer' ? 'transfer'
    : 'cash'
  const list = localGet('transactions')
  const newItem = {
    ...tx,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    category_id: CATEGORY_IDS[tx.category as keyof typeof CATEGORY_IDS] ?? null,
    sub_category_id: SUBCATEGORY_IDS[tx.subcategory] ?? null,
    payment_method: pm,
    source: 'manual',
    user_id: 'local',
    category: tx.category,
    subcategory: tx.subcategory,
    payment: tx.payment ?? '',
  }
  localSet('transactions', [newItem, ...list])
  return newItem
}

// ── 刪除交易記錄 ──
export const removeTransaction = async (id: string) => {
  if (await isLoggedIn()) {
    return deleteRecord(id)
  }
  const list = localGet('transactions')
  localSet('transactions', (list as { id: string }[]).filter(r => r.id !== id))
}

// ── 更新交易記錄 ──
export const editTransaction = async (id: string, tx: Partial<ExpenseInsert>) => {
  if (await isLoggedIn()) {
    return updateRecord(id, tx)
  }
  const list = localGet('transactions')
  localSet('transactions', (list as { id: string }[]).map(r => r.id === id ? { ...r, ...tx } : r))
}

// ── 匯出所有本機資料（JSON）──
export const exportLocalData = (): Record<string, unknown> => {
  const data: Record<string, unknown> = {}
  Object.entries(LOCAL_KEYS).forEach(([key, storageKey]) => {
    try { data[key] = JSON.parse(localStorage.getItem(storageKey) ?? '[]') }
    catch { data[key] = [] }
  })
  return data
}

// ── 匯入本機資料（JSON）──
export const importLocalData = (data: Record<string, unknown>) => {
  Object.entries(LOCAL_KEYS).forEach(([key, storageKey]) => {
    if (data[key] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(data[key]))
    }
  })
}

// ── 清除所有本機資料 ──
export const clearLocalData = () => {
  Object.values(LOCAL_KEYS).forEach(k => localStorage.removeItem(k))
}

// ── 登入後同步本機資料到 Supabase ──
export const syncLocalToSupabase = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const syncTargets = [
    { local: 'molly_transactions', table: 'transactions' },
    { local: 'molly_credit_cards', table: 'credit_cards' },
    { local: 'molly_stocks',       table: 'stocks' },
    { local: 'molly_goals',        table: 'savings_goals' },
  ]

  for (const { local, table } of syncTargets) {
    const localData: Record<string, unknown>[] = JSON.parse(localStorage.getItem(local) || '[]')
    if (localData.length === 0) continue
    const toUpload = localData.map(({ id: _id, ...item }) => ({
      ...item,
      user_id: user.id,
    }))
    await supabase.from(table).insert(toUpload).then(() => {
      localStorage.removeItem(local)
    })
  }
}
