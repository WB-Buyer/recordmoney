# 股票名稱自動搜尋功能修復
# 原因：Yahoo Finance API 有 CORS 限制，瀏覽器直接呼叫會被封鎖
# 解決方案：使用 Supabase Edge Function 當作代理 + 靜態對照表備用

---

## 一、建立 Supabase Edge Function（股票搜尋代理）

建立檔案 `supabase/functions/stock-search/index.ts`，內容如下：

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { symbol, market } = await req.json()
    const suffix = market === 'TW' ? '.TW' : ''
    const fullSymbol = `${symbol}${suffix}`

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${fullSymbol}?interval=1d&range=1d`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      }
    )

    const data = await res.json()
    const meta = data?.chart?.result?.[0]?.meta

    const name = meta?.longName || meta?.shortName || ''
    const price = meta?.regularMarketPrice || 0
    const currency = meta?.currency || (market === 'TW' ? 'TWD' : 'USD')

    return new Response(
      JSON.stringify({ name, price, currency, symbol: fullSymbol }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, name: '', price: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

---

## 二、建立靜態台股對照表（備用）

在 `src/lib/stockList.ts` 建立靜態對照表：

```typescript
export const TW_STOCK_LIST: Record<string, string> = {
  '0050': '元大台灣50',
  '0056': '元大高股息',
  '0057': '富邦摩台',
  '0061': '元大寶滬深',
  '00878': '國泰永續高股息',
  '00881': '國泰台灣5G+',
  '00900': '富邦特選高股息30',
  '1101': '台泥',
  '1216': '統一',
  '1301': '台塑',
  '1303': '南亞',
  '1326': '台化',
  '2002': '中鋼',
  '2105': '正新',
  '2207': '和泰車',
  '2303': '聯電',
  '2308': '台達電',
  '2317': '鴻海',
  '2327': '國巨',
  '2330': '台積電',
  '2347': '聯強',
  '2353': '宏碁',
  '2357': '華碩',
  '2379': '瑞昱',
  '2382': '廣達',
  '2395': '研華',
  '2412': '中華電',
  '2454': '聯發科',
  '2474': '可成',
  '2603': '長榮',
  '2609': '陽明',
  '2615': '萬海',
  '2881': '富邦金',
  '2882': '國泰金',
  '2883': '開發金',
  '2884': '玉山金',
  '2885': '元大金',
  '2886': '兆豐金',
  '2887': '台新金',
  '2890': '永豐金',
  '2891': '中信金',
  '2892': '第一金',
  '2912': '統一超',
  '3008': '大立光',
  '3034': '聯詠',
  '3037': '欣興',
  '3045': '台灣大',
  '3711': '日月光投控',
  '4904': '遠傳',
  '4938': '和碩',
  '5871': '中租-KY',
  '5876': '上海商銀',
  '6505': '台塑化',
  '6669': '緯穎',
}

export const US_STOCK_LIST: Record<string, string> = {
  'AAPL': 'Apple Inc.',
  'MSFT': 'Microsoft Corporation',
  'GOOGL': 'Alphabet Inc.',
  'AMZN': 'Amazon.com Inc.',
  'NVDA': 'NVIDIA Corporation',
  'META': 'Meta Platforms Inc.',
  'TSLA': 'Tesla Inc.',
  'TSM': 'Taiwan Semiconductor Manufacturing',
  'AVGO': 'Broadcom Inc.',
  'ORCL': 'Oracle Corporation',
  'AMD': 'Advanced Micro Devices',
  'INTC': 'Intel Corporation',
  'QCOM': 'Qualcomm Incorporated',
  'TXN': 'Texas Instruments',
  'AMAT': 'Applied Materials',
  'MU': 'Micron Technology',
  'ASML': 'ASML Holding N.V.',
  'SPY': 'SPDR S&P 500 ETF',
  'QQQ': 'Invesco QQQ Trust',
  'VOO': 'Vanguard S&P 500 ETF',
}

export function lookupStockName(symbol: string, market: 'TW' | 'US'): string {
  const upperSymbol = symbol.toUpperCase()
  if (market === 'TW') {
    return TW_STOCK_LIST[upperSymbol] || ''
  } else {
    return US_STOCK_LIST[upperSymbol] || ''
  }
}
```

---

## 三、修改新增持股表單的股票搜尋邏輯

在新增持股的 Step 1 表單元件中，修改搜尋邏輯如下：

```typescript
import { lookupStockName } from '../lib/stockList'
import { supabase } from '../lib/supabase'

const searchStock = async (symbol: string, market: 'TW' | 'US') => {
  if (!symbol || symbol.length < 2) return

  setSearching(true)
  setStockName('')
  setCurrentPrice(0)

  try {
    // 方案一：先從靜態表查詢（即時回應）
    const staticName = lookupStockName(symbol, market)
    if (staticName) {
      setStockName(staticName)
    }

    // 方案二：呼叫 Edge Function 取得即時名稱和現價
    const { data, error } = await supabase.functions.invoke('stock-search', {
      body: { symbol, market }
    })

    if (!error && data) {
      if (data.name) setStockName(data.name)
      if (data.price) setCurrentPrice(data.price)
    }
  } catch (err) {
    console.error('Stock search error:', err)
    // 如果 Edge Function 失敗，靜態表的結果還是有效的
  } finally {
    setSearching(false)
  }
}

// 輸入代號後延遲 800ms 自動搜尋
useEffect(() => {
  const timer = setTimeout(() => {
    if (symbol) searchStock(symbol, market)
  }, 800)
  return () => clearTimeout(timer)
}, [symbol, market])
```

---

## 四、更新現價功能修復

在投資頁面的「更新現價」按鈕，修改邏輯如下：

```typescript
const updateAllPrices = async () => {
  setUpdating(true)
  
  for (const stock of stocks) {
    try {
      const { data } = await supabase.functions.invoke('stock-search', {
        body: { symbol: stock.symbol, market: stock.market }
      })
      
      if (data?.price) {
        await supabase
          .from('stocks')
          .update({ current_price: data.price })
          .eq('id', stock.id)
      }
    } catch (err) {
      console.error(`Failed to update ${stock.symbol}:`, err)
    }
  }
  
  // 重新載入持股資料
  await loadStocks()
  setUpdating(false)
}
```

---

## 五、需要在 stocks 資料表新增 current_price 欄位

請在 Supabase SQL Editor 執行：

```sql
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS current_price DECIMAL(15,4) DEFAULT 0;
```

---

## 六、部署指令

完成以上修改後，在終端機執行：

```bash
# 部署 Edge Function
supabase link --project-ref mnhcukfrslvqbeyzyref
supabase functions deploy stock-search

# 推上 GitHub（Vercel 自動部署）
git add .
git commit -m "修復股票搜尋功能"
git push
```

---

## 執行順序

1. 先去 Supabase SQL Editor 執行第五點的 ALTER TABLE SQL
2. 建立 supabase/functions/stock-search/index.ts
3. 建立 src/lib/stockList.ts
4. 修改新增持股表單元件的搜尋邏輯
5. 修改更新現價按鈕邏輯
6. 執行部署指令
