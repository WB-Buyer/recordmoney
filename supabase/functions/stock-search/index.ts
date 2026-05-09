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
