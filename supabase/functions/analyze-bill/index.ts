import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `你是專業的台灣信用卡帳單辨識助手。
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
- 金額一律為正數`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { image, mimeType } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: image,
              },
            },
            { type: 'text', text: '請分析這張帳單圖片' },
          ],
        }],
      }),
    })

    const result = await res.json()
    const text = result.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text)

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
