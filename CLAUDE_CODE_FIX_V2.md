# 記帳 App 修正指令 V2
> 請依序完成以下所有修正，每個問題修完後告知完成狀態。
> 修完每個項目後執行 `npx tsc --noEmit` 確認無錯誤，再繼續下一項。

---

## 修正 1：登入方式改為 Magic Link，並永久保持登入狀態

### 1-1. Supabase Client 設定（src/lib/supabaseClient.ts）
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,       // session 存在 localStorage，關掉再開還在
      autoRefreshToken: true,     // token 快到期自動續期，不會突然被登出
      detectSessionInUrl: true,   // Magic Link 點開後自動完成登入
    }
  }
)
```

### 1-2. 登入 UI（放在設定頁面）
```typescript
// 未登入時顯示
const handleMagicLink = async () => {
  const { error } = await supabase.auth.signInWithOtp({
    email: inputEmail,
    options: {
      emailRedirectTo: window.location.origin
    }
  })
  if (!error) {
    setMessage('請檢查您的信箱，點擊連結即可登入 ✉️')
  }
}

// UI 元素：
// - 一個 Email 輸入框
// - 「發送登入連結」按鈕
// - 送出後顯示成功提示文字，不跳頁
// - 已登入時顯示「已登入：user@email.com」+ 「登出」按鈕
```

### 1-3. 監聽登入狀態（App.tsx 最上層）
```typescript
useEffect(() => {
  // 監聽登入狀態變化
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      if (event === 'SIGNED_IN') {
        // 登入成功後，將 localStorage 資料同步到 Supabase
        await syncLocalToSupabase()
      }
    }
  )
  return () => subscription.unsubscribe()
}, [])
```

### 1-4. 登入後同步本機資料到 Supabase（src/lib/storage.ts）
```typescript
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
    const localData = JSON.parse(localStorage.getItem(local) || '[]')
    if (localData.length === 0) continue
    // 上傳時帶入 user_id，移除本機的臨時 id 避免衝突
    const toUpload = localData.map(({ id, ...item }: any) => ({
      ...item,
      user_id: user.id
    }))
    await supabase.from(table).insert(toUpload)
    localStorage.removeItem(local)
  }
}
```

### 1-5. 登入狀態說明
| 情況 | 結果 |
|------|------|
| 關掉網頁再開（同瀏覽器） | ✅ 維持登入 |
| 手機重開機 | ✅ 維持登入 |
| 網路斷線再連 | ✅ 維持登入 |
| 清除瀏覽器快取 | ❌ 需重新登入 |
| 換手機／換瀏覽器 | ❌ 需重新登入一次 |

---

## 修正 2：手動記帳儲存後自動顯示在消費明細頁面

### 2-1. 儲存後的行為
```typescript
const handleSave = async () => {
  // 1. 儲存資料（Supabase 或 localStorage）
  await addTransaction(payload)

  // 2. 顯示成功提示
  toast.success('記帳成功！')

  // 3. 自動跳轉到消費明細頁面
  navigate('/transactions')  // 或對應的路由

  // 4. 重置表單
  resetForm()
}
```

### 2-2. 消費明細頁面需要即時更新
- 進入消費明細頁面時重新 fetch 最新資料
- 新增的那筆資料要排在最上方（依 date 降序排列）
- 每筆明細顯示：日期、分類 emoji、商家/備註、金額、消費方式

---

## 修正 3：帳單截圖辨識 — 可編輯分類 + 新增「信用卡明細總覽」頁面

### 3-1. 辨識結果可手動編輯分類
辨識完成後，每一筆消費明細都要可以編輯：

```typescript
// 每筆辨識結果的編輯元件
interface RecognizedItem {
  date: string
  merchant: string
  amount: number
  category: string      // AI 自動分類，可修改
  note: string
  card_name: string
}

// UI 設計：
// - 每筆顯示：日期 | 商家名稱 | 金額 | 分類下拉選單
// - 分類下拉選單選項：食、衣、住、行、娛樂、投資、其他、女兒
// - 可以修改日期、商家名稱、金額、分類
// - 底部「全部儲存」按鈕
```

### 3-2. 儲存後跳轉到信用卡明細總覽
```typescript
const handleSaveAll = async () => {
  for (const item of editedItems) {
    await addTransaction({
      date: item.date,
      amount: item.amount,
      type: 'expense',
      category_id: CATEGORY_IDS[item.category] ?? null,
      note: item.merchant,
      payment_method: 'credit_card',
      credit_card_id: matchCardId(item.card_name), // 比對 credit_cards 表
      source: 'ai_scan'
    })
  }
  navigate('/credit-card-summary')  // 跳轉到信用卡明細總覽
}
```

### 3-3. 新增頁面：信用卡明細總覽（/credit-card-summary）

**頁面結構：**
```
信用卡明細總覽
├── 月份選擇器（上下月切換）
└── 各卡片區塊（每張信用卡一個區塊）
    ├── 卡名稱（例：台新 Richart）
    ├── 本月應繳總金額
    ├── 繳款日倒數（例：還有 5 天）
    └── 分類消費明細
        ├── 🍜 食    $2,340
        ├── 🚗 行    $1,200
        ├── 🎬 娛樂  $330
        └── 其他     $450
```

**資料查詢邏輯：**
```typescript
// 查詢當月、該信用卡的所有消費
const { data } = await supabase
  .from('transactions')
  .select(`
    *,
    credit_cards(card_name, due_day),
    categories(name)
  `)
  .eq('payment_method', 'credit_card')
  .gte('date', startOfMonth)
  .lte('date', endOfMonth)

// 依 credit_card_id 分組，再依 category_id 加總金額
```

**底部導覽新增入口：**
- 將「信用卡明細總覽」加入底部導覽列，或在記帳頁的「帳單管理」tab 內加入入口按鈕

---

## 修正 4：投資頁面新增配息記錄功能

### 4-1. stock_dividends 表欄位確認
先在 Supabase SQL Editor 執行確認：
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'stock_dividends';
```

### 4-2. 新增配息記錄 UI
在投資組合頁面的「累計配息」區塊新增：

```typescript
// 新增配息表單
interface DividendRecord {
  stock_id: uuid       // 對應持股
  symbol: string       // 股票代號
  amount: number       // 配息金額（元）
  dividend_date: date  // 配息日期
  shares: number       // 配息當時持有股數
  per_share: number    // 每股配息金額（選填）
  note: string         // 備註（選填）
}

// UI 元素：
// 1. 「新增配息」按鈕（在累計配息區塊旁）
// 2. 點擊後跳出表單：
//    - 選擇股票（從現有持股選）
//    - 配息日期
//    - 配息金額（總額）
//    - 每股配息（選填，自動計算）
//    - 備註
// 3. 儲存後更新「累計配息」總額
```

### 4-3. 配息記錄列表顯示
```
累計配息總額：$12,500

配息記錄：
┌─────────────────────────────────────┐
│ 元大台灣50 (0050)                    │
│ 2026/03/21  配息 $3,200  (3.56/股)  │
├─────────────────────────────────────┤
│ 國泰永續高股息 (00878)                │
│ 2026/01/15  配息 $1,800  (0.45/股)  │
└─────────────────────────────────────┘
```

### 4-4. 投資報酬率計算（同步更新）
```typescript
// 每檔股票顯示：
{
  symbol: '0050',
  name: '元大台灣50',
  shares: 1000,
  average_cost: 90,        // 平均成本
  current_price: 94.6,     // 現價
  market_value: 94600,     // 市值 = shares * current_price
  cost_total: 90000,       // 投入成本 = shares * average_cost
  unrealized_pnl: 4600,    // 未實現損益 = market_value - cost_total
  unrealized_pnl_pct: 5.1, // 未實現報酬率 %
  total_dividend: 3200,    // 累計配息
  total_return: 7800,      // 總報酬 = unrealized_pnl + total_dividend
  total_return_pct: 8.67,  // 總報酬率 %
}
```

---

## 最後：全部修完後執行

```bash
npx tsc --noEmit
git add .
git commit -m "feat: Magic Link登入/記帳自動跳轉/信用卡明細總覽/配息記錄"
git push origin main
```
