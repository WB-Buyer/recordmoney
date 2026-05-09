// 前置任務 0：固定 UUID 分類常數（與 Supabase categories 表對應）
// 執行 SQL 插入後，這些 UUID 永遠不變，可直接使用而無需每次查 DB

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

export const SUBCATEGORY_IDS: Record<string, string> = {
  // 食的子分類
  '飲食':   '11111111-0000-0000-0001-000000000001',
  '飲料':   '11111111-0000-0000-0001-000000000002',
  // 行的子分類
  '交通':   '11111111-0000-0000-0004-000000000001',
  '停車':   '11111111-0000-0000-0004-000000000002',
  // 女兒的子分類
  '玩具':   '11111111-0000-0000-0008-000000000001',
  '書籍':   '11111111-0000-0000-0008-000000000002',
  '醫療':   '11111111-0000-0000-0008-000000000003',
  '衣服':   '11111111-0000-0000-0008-000000000004',
  // 女兒的娛樂 (id: 000000000005)
  '用品':   '11111111-0000-0000-0008-000000000006',
  '學費':   '11111111-0000-0000-0008-000000000007',
  '托育費': '11111111-0000-0000-0008-000000000008',
}

// 女兒的娛樂子分類（與主分類娛樂 UUID 不同）
const DAUGHTER_ENTERTAIN_ID = '11111111-0000-0000-0008-000000000005'

// 反向查找：UUID → 顯示名稱
const ALL_IDS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CATEGORY_IDS).map(([name, id]) => [id, name])),
  ...Object.fromEntries(Object.entries(SUBCATEGORY_IDS).map(([name, id]) => [id, name])),
  [DAUGHTER_ENTERTAIN_ID]: '娛樂',
}

export function categoryIdToName(id: string | null | undefined): string {
  if (!id) return ''
  return ALL_IDS[id] ?? id
}

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

// 本機模式的預設分類（與 Supabase 使用相同固定 UUID，方便未來同步）
export const DEFAULT_CATEGORIES = [
  { id: CATEGORY_IDS.食,   name: '食',   emoji: '🍜', parent_id: null },
  { id: CATEGORY_IDS.衣,   name: '衣',   emoji: '👗', parent_id: null },
  { id: CATEGORY_IDS.住,   name: '住',   emoji: '🏠', parent_id: null },
  { id: CATEGORY_IDS.行,   name: '行',   emoji: '🚗', parent_id: null },
  { id: CATEGORY_IDS.娛樂, name: '娛樂', emoji: '🎬', parent_id: null },
  { id: CATEGORY_IDS.投資, name: '投資', emoji: '📈', parent_id: null },
  { id: CATEGORY_IDS.其他, name: '其他', emoji: '📦', parent_id: null },
  { id: CATEGORY_IDS.女兒, name: '女兒', emoji: '👧', parent_id: null },
]
