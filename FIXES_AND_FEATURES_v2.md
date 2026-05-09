# 奶茶記帳 — 修改需求清單 v2
# 請依照以下所有需求逐一修正與新增功能

---

## 【記帳頁面】

### 1. 電腦鍵盤直接輸入金額
- 在電腦版，使用者可以直接用鍵盤輸入數字，不需要點頁面上的數字鍵盤
- 監聽 keydown 事件，數字鍵 0-9、運算符號（+ - * /）、Backspace、Enter、Escape 都要有對應動作
- Enter = 計算結果（等同按 =）
- Escape = 清空（等同按 C）

### 2. 數字鍵盤補齊按鍵
目前鍵盤缺少以下兩個按鍵，請加入：
- "=" 計算並顯示結果
- "C" 清空目前輸入，歸零重來

鍵盤排列更新為（4x5）：
```
7  8  9  ÷
4  5  6  ×
1  2  3  −
%  0  ⌫  +
C  =  .  （空）
```
或底部加一列：C 和 = 並排顯示

### 3. 匯款帳戶細分
消費方式選「匯款」時，右側帳戶下拉選項改為：
- 台新薪轉
- 台新 Richart
- 國泰 Cube
- 國泰美金
- 永豐大戶
- 玉山
- 富邦

### 4. 收入模式的分類與欄位調整
切換到「收入」時：
- 主分類改為（單層，不需要小分類）：
  薪資 / 獎金 / 老公給的零用錢 / 發票中獎 / 股票獲利 / 紅包 / 其它
- 移除「消費方式」欄位
- 新增「收帳帳戶」欄位，選項：現金 / 台新 / 永豐 / 國泰 / 玉山
- 小分類區塊在收入模式下完全隱藏

### 5. 消費明細頁面 — 新增匯出功能
- 在篩選列右側加入「匯出 Excel」和「匯出 PDF」兩個按鈕
- 匯出 Excel：使用 xlsx 套件，將當前篩選結果匯出為 .xlsx 檔案
- 匯出 PDF：
  - 使用 jspdf + jspdf-autotable 套件
  - 字體必須支援中文（使用 jspdf 搭配 NotoSansTC 字體的 base64 embedded 方式避免亂碼）
  - PDF 內容包含：篩選期間、各類別加總表、逐筆明細表
  - 表格欄位：日期、分類、小分類、備註、消費方式、金額

### 6. 帳單管理 — 修復上傳功能
- 修復上傳按鈕無法觸發的問題
- 實作圖片上傳流程：
  1. 點擊上傳區域或按鈕，開啟檔案選擇器（accept="image/*"，multiple）
  2. 選擇圖片後顯示縮圖預覽
  3. 點「開始辨識」按鈕後，將圖片轉為 base64 送到 Supabase Edge Function（analyze-bill）
  4. 顯示 loading 狀態（"AI 辨識中..."）
  5. 收到結果後依卡別分類顯示
- 如果 Edge Function 尚未部署，先顯示 mock 辨識結果供測試

---

## 【投資頁面】

### 1. 即時股價串接
- 台股：使用 Yahoo Finance API（https://query1.finance.yahoo.com/v8/finance/chart/2330.TW）取得即時或延遲報價
- 美股：使用 Yahoo Finance API（https://query1.finance.yahoo.com/v8/finance/chart/NVDA）
- TradingView Widget：在持股詳情展開後，嵌入 TradingView Mini Chart Widget 顯示走勢圖
  ```html
  <script src="https://s3.tradingview.com/tv.js"></script>
  ```
- 「更新現價」按鈕點擊後，批次呼叫 Yahoo Finance API 更新所有持股現價
- 現價更新後自動重新計算市值和損益

### 2. 新增持股功能改善

**最佳設計方式（請按此實作）：**

Step 1 — 搜尋股票：
- 輸入股票代號後，自動呼叫 Yahoo Finance search API 取得股票名稱
  ```
  https://query1.finance.yahoo.com/v1/finance/search?q=2330&lang=zh-TW
  ```
- 股票名稱欄位自動填入，使用者可手動修改

Step 2 — 設定持股單位：
- 新增「持股單位」選擇：張 / 股
  - 選「張」：1張 = 1000股，系統內部統一換算為股數儲存
  - 選「股」：直接輸入股數
- 顯示換算結果（例如：輸入 2 張 = 2,000 股）

Step 3 — 新增投入紀錄：
每筆投入記錄欄位：
- 日期
- 買入數量（張或股，依上方選擇）
- 買入價格（每股/每張）
- 資金來源（老公 / 老婆 / 女兒）
- 可新增多筆投入記錄

Step 4 — 定期定額設定（選填）：
- 是否為定期定額：是 / 否
- 若是：設定每月金額、扣款日、對應帳戶
- 例如：每月5日扣款5000元買入0050

Step 5 — 確認儲存：
- 顯示摘要：股票名稱、總持股數、平均成本、總投入
- 確認後寫入 stocks 和 stock_investments 資料表

**庫存價值修正功能：**
- 在持股卡片右上角加入「校正庫存」按鈕
- 點擊後可直接輸入目前實際持股數量進行修正
- 修正後重新計算均價和損益

---

## 【目標頁面】

### 1. 修復新增目標按鈕無反應的問題
- 檢查並修復「+ 新增儲蓄目標」按鈕的 onClick 事件
- 點擊後應彈出新增目標的 Modal 或底部滑出面板
- 表單欄位：
  - 目標名稱（文字輸入）
  - 目標金額（數字輸入）
  - 幣別（TWD / USD）
  - 參照帳戶（台新薪轉 / 台新Richart / 國泰Cube / 國泰美金 / 永豐大戶 / 玉山 / 富邦）
  - 截止日期（日期選擇器，選填）
  - 目標圖示（可上傳圖片，上傳到 Supabase Storage goal-icons bucket）
- 儲存後寫入 savings_goals 資料表，並即時顯示在頁面上

---

## 【設定頁面】

### 1. 大頭貼上傳功能
- 用戶資料區塊的頭像改為可點擊
- 點擊後開啟圖片選擇器
- 選擇圖片後上傳到 Supabase Storage avatars bucket
- 上傳成功後即時更新顯示
- 不顯示 email，只顯示名稱和頭像

### 2. 修復收支類別管理的編輯/刪除功能
- 修復「編輯」按鈕點擊無反應的問題
- 修復「刪除」按鈕點擊無反應的問題
- 編輯：點擊後可修改主分類名稱和小分類列表，儲存後更新資料庫
- 刪除：點擊後顯示確認對話框，確認後從資料庫刪除
- 修復「+ 新增主分類」按鈕無反應的問題
- 新增主分類表單：輸入主分類名稱 + 小分類（可新增多個，用 tag 方式輸入）
- 所有操作都要更新 categories 資料表

### 3. 修復信用卡管理的編輯功能
- 修復信用卡列表的「編輯」按鈕無反應問題
- 編輯欄位：卡片名稱、結帳日、繳款日、連動帳戶、是否自動扣款
- 新增「+ 新增信用卡」按鈕，表單欄位同上
- 所有操作更新 credit_cards 資料表

### 4. 修復匯出資料功能
- 修復匯出按鈕無反應的問題
- 匯出 Excel（.xlsx）：
  - 使用 xlsx 套件
  - 包含多個工作表：消費明細、信用卡帳單、投資紀錄、配息紀錄
  - 下載到本機後，同時透過 emailjs 或 mailto 提示寄送到 win29989@gmail.com
- 匯出 PDF：
  - 使用 jspdf + jspdf-autotable
  - 嵌入 Noto Sans TC 字體的 base64 資料避免中文亂碼
  - 包含所有資料的完整報表
  - 下載到本機

---

## 【技術補充說明】

### PDF 中文字體問題解決方案
```javascript
// 安裝套件
// npm install jspdf jspdf-autotable

// 在 jspdf 中使用中文字體
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// 方法：使用 canvas 渲染後截圖轉 PDF（確保中文正確顯示）
// 或使用 html2canvas + jspdf 組合
// npm install html2canvas

import html2canvas from 'html2canvas'

const exportPDF = async () => {
  const element = document.getElementById('export-content')
  const canvas = await html2canvas(element, { scale: 2 })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF('p', 'mm', 'a4')
  const imgWidth = 210
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
  pdf.save('奶茶記帳報表.pdf')
}
```

### Yahoo Finance API 使用方式
```javascript
// 台股（在代號後加 .TW）
const getTWStock = async (symbol: string) => {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?interval=1d&range=1d`
  )
  const data = await res.json()
  return data.chart.result[0].meta.regularMarketPrice
}

// 美股
const getUSStock = async (symbol: string) => {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
  )
  const data = await res.json()
  return data.chart.result[0].meta.regularMarketPrice
}

// 搜尋股票名稱
const searchStock = async (query: string) => {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${query}&lang=zh-TW&region=TW`
  )
  const data = await res.json()
  return data.quotes[0]?.shortname || data.quotes[0]?.longname
}
```

### TradingView Mini Widget
```html
<!-- 嵌入走勢圖 -->
<div class="tradingview-widget-container">
  <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js">
  {
    "symbol": "TWSE:2330",
    "width": "100%",
    "height": 220,
    "locale": "zh_TW",
    "colorTheme": "light",
    "autosize": true
  }
  </script>
</div>
```

---

## 執行順序建議

1. 先修復所有按鈕無反應的問題（設定頁、目標頁）
2. 修復記帳頁的鍵盤和收入分類
3. 新增匯出功能（Excel + PDF）
4. 修復帳單管理上傳
5. 改善投資頁新增持股流程
6. 串接 Yahoo Finance 即時報價
7. 新增 TradingView 圖表

請依序執行，每個功能完成後告知我。
