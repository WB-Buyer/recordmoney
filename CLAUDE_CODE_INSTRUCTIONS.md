# 記帳 App 修正指令
> 請依序完成以下所有修正，每個問題修完後告知完成狀態。

---

## 【前置確認】已知的 Supabase 真實 Schema

### 所有 Tables
```
bank_accounts, categories, credit_cards, profiles,
savings_goals, stock_dividends, stock_investments, stocks, transactions
```

### ⚠️ 重要：categories 表目前是空的
查詢結果為「No rows returned」，代表分類資料尚未建立。
**必須先執行下方「前置任務 0」插入預設分類資料，否則 category_id 永遠查不到，記帳無法儲存。**

### transactions 欄位（完整）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid | |
| amount | numeric | |
| type | text | 'income' 或 'expense' |
| category_id | uuid | FK → categories.id（非 text，需查 uuid） |
| sub_category_id | uuid | FK → categories.id（非 text，需查 uuid） |
| date | date | |
| note | text | |
| payment_method | text | 'cash' / 'credit_card' / 'transfer' |
| credit_card_id | uuid | FK → credit_cards.id（注意：不是 card_id） |
| bank_account_id | uuid | FK → bank_accounts.id |
| source | text | 'manual' 或 'ai_scan' |
| created_at | timestamptz | |

### credit_cards 欄位（完整）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid | |
| card_name | text | |
| closing_day | integer | 結帳日 |
| due_day | integer | 繳款日 |
| linked_account_id | uuid | FK → bank_accounts.id（連動帳戶） |
| auto_debit | boolean | 是否自動扣款 |
| current_balance | numeric | 本期應繳金額 |
| created_at | timestamptz | |

### bank_accounts 欄位（完整）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid | PK |
| user_id | uuid | |
| bank_name | text | 銀行名稱 |
| account_type | text | 帳戶類型 |
| balance | numeric | 目前餘額 |
| created_at | timestamptz | |

---

## 前置任務 0：在 Supabase 插入預設分類資料（最優先執行）

> ⚠️ categories 表目前是空的，必須先插入以下資料，否則記帳功能無法正常運作。
> 請在 Supabase SQL Editor 執行這段 SQL：

```sql
INSERT INTO categories (id, name, parent_id) VALUES
  ('11111111-0000-0000-0000-000000000001', '食',   NULL),
  ('11111111-0000-0000-0000-000000000002', '衣',   NULL),
  ('11111111-0000-0000-0000-000000000003', '住',   NULL),
  ('11111111-0000-0000-0000-000000000004', '行',   NULL),
  ('11111111-0000-0000-0000-000000000005', '娛樂', NULL),
  ('11111111-0000-0000-0000-000000000006', '投資', NULL),
  ('11111111-0000-0000-0000-000000000007', '其他', NULL),
  -- 女兒主分類
  ('11111111-0000-0000-0000-000000000008', '女兒', NULL),
  -- 食的子分類
  ('11111111-0000-0000-0001-000000000001', '飲食',   '11111111-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0001-000000000002', '飲料',   '11111111-0000-0000-0000-000000000001'),
  -- 行的子分類
  ('11111111-0000-0000-0004-000000000001', '交通',   '11111111-0000-0000-0000-000000000004'),
  ('11111111-0000-0000-0004-000000000002', '停車',   '11111111-0000-0000-0000-000000000004'),
  -- 女兒的子分類
  ('11111111-0000-0000-0008-000000000001', '玩具',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000002', '書籍',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000003', '醫療',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000004', '衣服',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000005', '娛樂',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000006', '用品',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000007', '學費',   '11111111-0000-0000-0000-000000000008'),
  ('11111111-0000-0000-0008-000000000008', '托育費', '11111111-0000-0000-0000-000000000008')
ON CONFLICT (id) DO NOTHING;
```

執行後確認回傳「20 rows affected」即成功。

程式碼中使用固定 uuid 對應分類名稱，建立常數：

```typescript
// src/lib/categories.ts
export const CATEGORY_IDS = {
  食:   '11111111-0000-0000-0000-000000000001',
  衣:   '11111111-0000-0000-0000-000000000002',
  住:   '11111111-0000-0000-0000-000000000003',
  行:   '11111111-0000-0000-0000-000000000004',
  娛樂: '11111111-0000-0000-0000-000000000005',
  投資: '11111111-0000-0000-0000-000000000006',
  其他: '11111111-0000-0000-0000-000000000007',
  女兒: '11111111-0000-0000-0000-000000000008',
} as const

// AI 辨識分類文字 → uuid 對應
export const AI_CATEGORY_MAP: Record<string, string> = {
  '食':   CATEGORY_IDS.食,
  '衣':   CATEGORY_IDS.衣,
  '住':   CATEGORY_IDS.住,
  '行':   CATEGORY_IDS.行,
  '娛樂': CATEGORY_IDS.娛樂,
  '投資': CATEGORY_IDS.投資,
  '其他': CATEGORY_IDS.其他,
}
```

---

## 問題 1：計算機顯示區移除正負號

- 支出時不要在數字前自動顯示「`-`」
- 收入時不要在數字前自動顯示「`+`」
- 顯示區只顯示純數字，正負屬性由「支出／收入」Tab 本身決定
- 實際寫入 DB 時再依 `type` 欄位判斷

---

## 問題 2：計算機功能按鍵放大

`÷ × − + % C ⌫ =` 這些功能按鍵需調整：

- `font-size`: 22px
- `min-height`: 與數字鍵相同高度
- `font-weight`: 500
- 視覺重量需與數字鍵一致，方便手機點擊

---

## 問題 3：修正 Supabase 欄位名稱錯誤（核心問題）

### 3-1. Table 名稱
全域搜尋 `'records'`，全部改為 `'transactions'`

### 3-2. 欄位名稱對應修正
| 舊（錯誤） | 新（正確） | 備註 |
|-----------|-----------|------|
| `category` | `category_id` | 需傳 uuid |
| `sub_category` | `sub_category_id` | 需傳 uuid |
| `card_id` | `credit_card_id` | 欄位名稱不同 |

### 3-3. category_id 的正確處理方式
categories 表使用**固定 uuid**（見前置任務 0 的 CATEGORY_IDS 常數）。
不需要每次都查 DB，直接從常數取值：

```typescript
import { CATEGORY_IDS, AI_CATEGORY_MAP } from '@/lib/categories'

// 手動記帳：直接用常數
const category_id = CATEGORY_IDS[selectedCategoryName] ?? null

// AI 辨識：用 AI_CATEGORY_MAP 轉換
const category_id = AI_CATEGORY_MAP[aiResult.category] ?? null
```

### 3-4. Insert 時加入 source 欄位
- 手動記帳 → `source: 'manual'`
- AI 辨識匯入 → `source: 'ai_scan'`

---

## 問題 4：AI 帳單截圖辨識修正

找到呼叫 Claude Vision API 的位置（Edge Function 或前端），將 system prompt 完整替換為：

```
你是專業的台灣信用卡帳單辨識助手。
分析圖片中的信用卡對帳單，只回傳 JSON，不加任何說明文字或 markdown 符號。

回傳格式：
{
  "card_name": "卡別名稱（如：玉山 U Bear 卡）",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "merchant": "消費商家完整名稱",
      "amount": 正整數金額,
      "category": "食 或 衣 或 住 或 行 或 娛樂 或 投資 或 其他",
      "note": "帳單原始描述"
    }
  ],
  "total_amount": 本期應繳總金額,
  "due_date": "YYYY-MM-DD 或 null"
}

分類規則：
- Uber / 計程車 / Q Taxi / 停車 → 行
- 餐廳 / 超商 / 超市 / 全聯 / 食品 → 食
- 百貨 / 服飾 / POYA → 衣
- 房租 / 水電 / 家居 → 住
- Netflix / 電影 / 串流 / 遊戲 → 娛樂
- 保險 / 基金 / 股票 → 投資
- 其他 → 其他

注意：
- 忽略回饋金、紅利、點數折抵等非消費項目
- 忽略上期未繳、分期手續費
- 年份若帳單只有月/日（如 03/13），補當前年度
- 金額一律為正數
```

### 辨識後前端處理流程
1. 用 `card_name` 比對 `credit_cards` 表，找出對應 `credit_card_id`
2. 用 `category` 文字查 `categories` 表，找出對應 `category_id`
3. 顯示確認 UI 讓使用者可修改後，再寫入 `transactions` 表（`source: 'ai_scan'`）

---

## 問題 5：股票名稱改為中文顯示

### 建立對照表 `src/lib/stockNames.ts`

```typescript
export const TW_STOCK_NAMES: Record<string, string> = {
  // ── 使用者持股 ──
  '0050':   '元大台灣50',
  '00631L': '元大台灣50正2',   // 槓桿型 ETF
  '00878':  '國泰永續高股息',
  '00981A': '中信中國高股息A',
  '9105':   '泰金寶-DR',          // 存託憑證 DR，非一般個股
  '00935':  '野村臺灣價值成長',

  // ── 常見個股 ──
  '2330': '台積電',
  '2317': '鴻海',
  '2454': '聯發科',
  '2412': '中華電',
  '2882': '國泰金',
  '2881': '富邦金',
  '2886': '兆豐金',
  '2891': '中信金',
  '2303': '聯電',
  '6505': '台塑化',
  '2002': '中鋼',
  '1301': '台塑',
  '1303': '南亞',
  '2308': '台達電',
  '3711': '日月光投控',

  // ── 常見 ETF ──
  '0056':   '元大高股息',
  '00919':  '群益台灣精選高息',
  '00900':  '富邦特選高股息30',
  '006208': '富邦台50',
}

export const US_STOCK_NAMES: Record<string, string> = {
  // ── 使用者持股 ──
  'TSM': '台積電 ADR',
  'VOO': 'Vanguard S&P 500 ETF',

  // ── 常見美股 ──
  'AAPL':  'Apple',
  'MSFT':  'Microsoft',
  'NVDA':  'NVIDIA',
  'GOOGL': 'Alphabet',
  'AMZN':  'Amazon',
  'META':  'Meta',
  'TSLA':  'Tesla',
  'QQQ':   'Nasdaq 100 ETF',
  'SPY':   'S&P 500 ETF',
  'VTI':   'Vanguard 全市場 ETF',
}

// 通用查詢函式
export function getStockName(symbol: string, market: 'TW' | 'US'): string {
  const upper = symbol.toUpperCase()
  if (market === 'TW') return TW_STOCK_NAMES[upper] ?? upper
  return US_STOCK_NAMES[upper] ?? upper
}

// 是否為槓桿型 ETF
export const LEVERAGED_ETFS = new Set(['00631L', '00632R', '00633L', '00634R'])
export function isLeveraged(symbol: string): boolean {
  return LEVERAGED_ETFS.has(symbol.toUpperCase())
}

// 是否為存託憑證 DR
export const DR_STOCKS = new Set(['9105'])
export function isDR(symbol: string): boolean {
  return DR_STOCKS.has(symbol.toUpperCase())
}
```

### 顯示規則
- 搜尋結果顯示：`中文名稱 (代號)` → 例：`元大台灣50 (0050)`
- 持股列表顯示：中文名稱為主，代號縮小顯示在旁
- `stocks` 表寫入時 `name` 欄位存**中文名稱**
- `00631L` 等槓桿型 ETF 加上「槓桿」小標籤警示
- 台股顯示 `TWD`，美股顯示 `USD`
- 投資組合總覽分「台股庫存」和「美股庫存」兩個 Section

### 特別注意
- `TSM`（美股）與 `2330`（台股）為同一公司但**分開計算損益**，TSM 為 ADR，1 股 = 5 股台積電，匯率需另外處理
- `9105` 為**存託憑證（DR）**，非一般個股，持股列表需標示「DR」小標籤，損益計算與一般股票相同
- `00981A`、`00631L` 代號含英文，呼叫永豐金 API 時注意大小寫格式

---

## 問題 6：支援不登入的 localStorage 本機模式

### 6-1. 入口判斷
App 啟動時若 `session` 為 `null`，**不強制跳轉登入頁**，改為進入本機模式。

### 6-2. localStorage Keys
```
molly_transactions   → Transaction[]
molly_credit_cards   → CreditCard[]
molly_stocks         → Stock[]
molly_goals          → SavingsGoal[]
molly_categories     → Category[]（預設一份，避免查 DB）
```

### 6-3. 建立統一 Storage Helper（`src/lib/storage.ts`）

```typescript
import { supabase } from './supabaseClient'

const isLoggedIn = async () => {
  const { data } = await supabase.auth.getSession()
  return !!data.session
}

const LOCAL_KEYS = {
  transactions:  'molly_transactions',
  credit_cards:  'molly_credit_cards',
  stocks:        'molly_stocks',
  goals:         'molly_goals',
  categories:    'molly_categories',
}

const localGet = (key: keyof typeof LOCAL_KEYS) => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEYS[key]) ?? '[]') }
  catch { return [] }
}

const localSet = (key: keyof typeof LOCAL_KEYS, data: any) => {
  localStorage.setItem(LOCAL_KEYS[key], JSON.stringify(data))
}

// ── 讀取交易記錄 ──
export const getTransactions = async () => {
  if (await isLoggedIn()) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) throw error
    return data
  }
  return localGet('transactions')
}

// ── 新增交易記錄 ──
export const addTransaction = async (tx: any) => {
  if (await isLoggedIn()) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(tx)
      .select()
      .single()
    if (error) throw error
    return data
  }
  const list = localGet('transactions')
  const newItem = { ...tx, id: crypto.randomUUID(), created_at: new Date().toISOString() }
  localSet('transactions', [newItem, ...list])
  return newItem
}

// ── 其他 CRUD 方法參照上方模式實作 ──
// getCategories / getCreditCards / getStocks / getSavingsGoals
// add* / update* / delete*
```

### 6-4. 本機模式的預設分類
使用與 Supabase 相同的固定 uuid，確保未來登入同步時不會衝突：

```typescript
export const DEFAULT_CATEGORIES = [
  { id: '11111111-0000-0000-0000-000000000001', name: '食',   emoji: '🍜', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000002', name: '衣',   emoji: '👗', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000003', name: '住',   emoji: '🏠', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000004', name: '行',   emoji: '🚗', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000005', name: '娛樂', emoji: '🎬', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000006', name: '投資', emoji: '📈', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000007', name: '其他', emoji: '📦', parent_id: null },
  { id: '11111111-0000-0000-0000-000000000008', name: '女兒', emoji: '👧', parent_id: null },
]
```

### 6-5. 設定頁面新增以下功能
- 「登入以備份雲端」入口按鈕
- 「匯出資料（JSON）」按鈕 — 下載包含所有 localStorage 資料的 JSON 檔
- 「匯入資料（JSON）」按鈕 — 讀取 JSON 檔還原資料（需二次確認覆蓋）
- 「清除所有本機資料」按鈕（需二次確認）

---

## 完成後請確認

- [ ] 手動記帳可以成功儲存到 Supabase
- [ ] 未登入狀態下可以正常記帳（存到 localStorage）
- [ ] AI 辨識帳單截圖後正確顯示消費明細
- [ ] 股票持股頁面顯示中文名稱
- [ ] 計算機數字顯示無正負號前綴
- [ ] 計算機功能按鍵尺寸放大
