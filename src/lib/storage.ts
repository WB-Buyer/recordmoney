// src/lib/storage.ts — 向後相容包裝層
// 交易記錄函數改由 localDB 統一管理
export {
  getTransactions,
  addTransaction,
  deleteTransaction as removeTransaction,
  updateTransaction as editTransaction,
} from './localDB'

// ── 本機資料管理（使用新的 mlk_ keys）──
const MLK_KEYS: Record<string, string> = {
  transactions: 'mlk_transactions',
  accounts:     'mlk_accounts',
  stocks:       'mlk_stocks',
  investments:  'mlk_investments',
  dividends:    'mlk_dividends',
  credit_cards: 'mlk_credit_cards',
  categories:   'mlk_categories',
}

export const exportLocalData = (): Record<string, unknown> => {
  const data: Record<string, unknown> = {}
  Object.entries(MLK_KEYS).forEach(([key, storageKey]) => {
    try { data[key] = JSON.parse(localStorage.getItem(storageKey) ?? '[]') }
    catch { data[key] = [] }
  })
  return data
}

export const importLocalData = (data: Record<string, unknown>) => {
  Object.entries(MLK_KEYS).forEach(([key, storageKey]) => {
    if (data[key] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(data[key]))
    }
  })
}

export const clearLocalData = () => {
  Object.values(MLK_KEYS).forEach(k => localStorage.removeItem(k))
  // 也清除 session exp
  localStorage.removeItem('mlk_session_exp')
  localStorage.removeItem('mlk_last_sync')
}

export const syncLocalToSupabase = async () => {
  const { pushUnsyncedToSupabase } = await import('./localDB')
  await pushUnsyncedToSupabase()
}
