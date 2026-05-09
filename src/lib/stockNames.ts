export const TW_STOCK_NAMES: Record<string, string> = {
  // ── 使用者持股 ──
  '0050':   '元大台灣50',
  '00631L': '元大台灣50正2',
  '00878':  '國泰永續高股息',
  '00981A': '統一台股增長',
  '9105':   '泰金寶-DR',
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
  '1216': '統一',
  '1101': '台泥',
  '2382': '廣達',
  '2357': '華碩',
  '2379': '瑞昱',
  '2603': '長榮',
  '2609': '陽明',
  '2884': '玉山金',
  '2885': '元大金',
  '2887': '台新金',
  '2890': '永豐金',
  '2892': '第一金',
  '3008': '大立光',
  '4904': '遠傳',
  '3045': '台灣大',

  // ── 常見 ETF ──
  '0056':   '元大高股息',
  '00919':  '群益台灣精選高息',
  '00900':  '富邦特選高股息30',
  '006208': '富邦台50',
  '00881':  '國泰台灣5G+',
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
  'AVGO':  'Broadcom',
  'ORCL':  'Oracle',
  'AMD':   'AMD',
  'INTC':  'Intel',
  'ASML':  'ASML',
  'MU':    'Micron',
}

// 通用查詢函式（找不到則回傳代號本身）
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
