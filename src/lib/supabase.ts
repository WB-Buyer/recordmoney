import { createClient } from '@supabase/supabase-js'
import { CATEGORY_IDS, SUBCATEGORY_IDS, categoryIdToName } from './categories'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase 環境變數未設定，請檢查 .env.local')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})

async function getUserId(): Promise<string> {
  // 用 getSession（讀 localStorage）取代 getUser（網路請求），避免 hang 住
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) throw new Error('請先登入才能儲存記帳')
  return session.user.id
}

// ─── 型別定義 ───────────────────────────────────────────────

// 問題 3：Category 改為與 Supabase categories 表一致的 8 個主分類
export type Category =
  | '食' | '衣' | '住' | '行'
  | '娛樂' | '投資' | '其他' | '女兒'

export type Subcategory = string

export const CATEGORIES: Record<Category, Subcategory[]> = {
  食:   ['飲食', '飲料', '三餐', '買菜', '點心', '咖啡'],
  衣:   ['衣服褲子', '鞋子', '飾品', '內衣褲'],
  住:   ['房租', '水電', '家居', '修繕', '清潔'],
  行:   ['交通', '停車', '加油', 'Etag', '保養', '維修'],
  娛樂: ['活動票券', 'Netflix', '電影', '遊戲'],
  投資: ['壽險', '醫療險', '車險', '基金', '股票'],
  其他: ['日用品', '醫療', '稅金', '貓咪', '社交', '美容'],
  女兒: ['玩具', '書籍', '醫療', '衣服', '娛樂', '用品', '學費', '托育費'],
}

export const CATEGORY_EMOJI: Record<Category, string> = {
  食:   '🍱',
  衣:   '👗',
  住:   '🏠',
  行:   '🚗',
  娛樂: '🎟️',
  投資: '📈',
  其他: '📦',
  女兒: '👧',
}

export const CATEGORY_LIST = Object.keys(CATEGORIES) as Category[]

// Expense：讀取時的完整型別（含 DB 欄位 + 顯示用計算欄位）
export interface Expense {
  id: string
  created_at: string
  date: string
  amount: number
  note: string | null
  type: 'expense' | 'income'
  // DB 欄位（問題 3：正確欄位名稱）
  category_id: string | null
  sub_category_id: string | null
  payment_method: string | null
  credit_card_id: string | null
  bank_account_id: string | null
  source: string
  user_id: string
  // 顯示用欄位（由 getRecords 自動從 UUID 反查名稱填入）
  category: string
  subcategory: string
  payment: string
}

// ExpenseInsert：新增時傳入的 UI 友善格式（insertRecord 內部做轉換）
export interface ExpenseInsert {
  date: string
  category: string       // 主分類名稱，insertRecord 內部轉換為 category_id
  subcategory: string    // 小分類名稱，insertRecord 內部轉換為 sub_category_id
  amount: number
  note?: string
  type?: string
  payment?: string           // 卡片名稱或帳戶名稱（顯示用）
  payment_method?: 'credit' | 'cash' | 'transfer'  // 問題 3：對應 DB payment_method
  credit_card_id?: string | null  // 信用卡 UUID（credit 時使用）
}

// ─── 資料庫操作 ─────────────────────────────────────────────

export async function getRecords(year?: number, month?: number) {
  let query = supabase
    .from('transactions')   // 問題 3：table 名稱 records → transactions
    .select('*')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (year && month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const end = new Date(year, month, 0)
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    query = query.gte('date', start).lte('date', endStr)
  }

  const { data, error } = await query
  if (error) throw error

  // 問題 3：將 DB 欄位（UUID）反查為顯示用名稱
  return (data ?? []).map(row => ({
    ...row,
    category:    categoryIdToName(row.category_id),
    subcategory: categoryIdToName(row.sub_category_id),
    payment:     row.payment_method === 'credit_card' ? '信用卡'
      : row.payment_method === 'transfer' ? '匯款'
      : '現金',
  })) as Expense[]
}

export async function insertRecord(record: ExpenseInsert) {
  const user_id = await getUserId()

  // 問題 3：payment_method 映射
  const pm = record.payment_method === 'credit'   ? 'credit_card'
    : record.payment_method === 'transfer' ? 'transfer'
    : 'cash'

  const payload: Record<string, unknown> = {
    user_id,
    date:             record.date,
    amount:           record.amount,
    type:             record.type ?? 'expense',
    // 問題 3：category → category_id（uuid）
    category_id:      CATEGORY_IDS[record.category as keyof typeof CATEGORY_IDS] ?? null,
    // 問題 3：subcategory → sub_category_id（uuid）
    sub_category_id:  SUBCATEGORY_IDS[record.subcategory] ?? null,
    // 問題 3：payment → payment_method（標準值）
    payment_method:   pm,
    credit_card_id:   record.credit_card_id ?? null,
    note:             record.note || null,
    // 問題 3：加入 source 欄位
    source:           'manual',
  }

  const { data, error } = await supabase
    .from('transactions')   // 問題 3：records → transactions
    .insert(payload)
    .select()
    .single()
  if (error) throw error

  return {
    ...data,
    category:    categoryIdToName(data.category_id),
    subcategory: categoryIdToName(data.sub_category_id),
    payment:     pm === 'credit_card' ? '信用卡' : pm === 'transfer' ? '匯款' : '現金',
  } as Expense
}

export async function updateRecord(id: string, record: Partial<ExpenseInsert>) {
  const updatePayload: Record<string, unknown> = {}
  if (record.date      !== undefined) updatePayload.date   = record.date
  if (record.amount    !== undefined) updatePayload.amount = record.amount
  if (record.note      !== undefined) updatePayload.note   = record.note || null
  if (record.type      !== undefined) updatePayload.type   = record.type
  if (record.category  !== undefined) {
    updatePayload.category_id = CATEGORY_IDS[record.category as keyof typeof CATEGORY_IDS] ?? null
  }
  if (record.subcategory !== undefined) {
    updatePayload.sub_category_id = SUBCATEGORY_IDS[record.subcategory] ?? null
  }
  if (record.payment_method !== undefined) {
    updatePayload.payment_method = record.payment_method === 'credit' ? 'credit_card'
      : record.payment_method
  }

  const { data, error } = await supabase
    .from('transactions')   // 問題 3：records → transactions
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error

  return {
    ...data,
    category:    categoryIdToName(data.category_id),
    subcategory: categoryIdToName(data.sub_category_id),
    payment:     data.payment_method === 'credit_card' ? '信用卡'
      : data.payment_method === 'transfer' ? '匯款' : '現金',
  } as Expense
}

export async function deleteRecord(id: string) {
  const { error } = await supabase.from('transactions').delete().eq('id', id)   // 問題 3
  if (error) throw error
}

// ─── 投資組合型別 ────────────────────────────────────────────

export interface Stock {
  id: string
  created_at: string
  market: 'tw' | 'us'
  symbol: string
  name: string
  currency: 'TWD' | 'USD'
  current_price: number
}

export interface StockInsert {
  market: 'tw' | 'us'
  symbol: string
  name: string
  currency: 'TWD' | 'USD'
  current_price: number
}

export interface Investment {
  id: string
  created_at: string
  stock_id: string
  date: string
  shares: number
  cost_per_share: number
  source: string
}

export interface InvestmentInsert {
  stock_id: string
  date: string
  shares: number
  cost_per_share: number
  source: string
}

// ─── 投資組合操作 ────────────────────────────────────────────

export async function getStocks() {
  const { data, error } = await supabase
    .from('stocks')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Stock[]
}

export async function insertStock(stock: StockInsert) {
  const { data, error } = await supabase
    .from('stocks')
    .insert({ ...stock, user_id: await getUserId() })
    .select()
    .single()
  if (error) throw error
  return data as Stock
}

export async function updateStockPrice(id: string, current_price: number) {
  const { error } = await supabase
    .from('stocks')
    .update({ current_price })
    .eq('id', id)
  if (error) throw error
}

export async function getInvestments() {
  const { data, error } = await supabase
    .from('stock_investments')
    .select('*')
    .order('date', { ascending: true })
  if (error) throw error
  return data as Investment[]
}

export async function insertInvestment(inv: InvestmentInsert) {
  const { data, error } = await supabase
    .from('stock_investments')
    .insert({ ...inv, user_id: await getUserId() })
    .select()
    .single()
  if (error) throw error
  return data as Investment
}

// ─── 配息紀錄型別 ────────────────────────────────────────────

export interface Dividend {
  id: string
  created_at: string
  stock_id: string
  date: string
  dividend_per_share: number
  shares: number
  total_amount: number
  currency?: string
  note?: string
}

export interface DividendInsert {
  stock_id: string
  date: string
  dividend_per_share: number
  shares: number
  total_amount: number
  currency?: string
  note?: string
}

// ─── 配息紀錄操作 ────────────────────────────────────────────

export async function getDividends() {
  const { data, error } = await supabase
    .from('stock_dividends')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data as Dividend[]
}

export async function insertDividend(div: DividendInsert) {
  const { data, error } = await supabase
    .from('stock_dividends')
    .insert({ ...div, user_id: await getUserId() })
    .select()
    .single()
  if (error) throw error
  return data as Dividend
}
