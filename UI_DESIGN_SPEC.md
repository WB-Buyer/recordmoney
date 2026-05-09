# 奶茶記帳 UI 設計規格書
# 請完全按照此規格重新設計整個 App 的 UI，不可自行發揮

---

## 一、色系與字體（全域）

```css
--milk: #F5F0E8;          /* 主背景 */
--milk-deep: #DDD5C8;     /* 側欄/底部導覽/標題列 */
--milk-mid: #EAE3D8;      /* 次要背景 */
--milk-card: #F0EAE0;     /* 卡片背景 */
--text-dark: #2C2820;     /* 主文字 */
--text-mid: #6B5E52;      /* 次要文字 */
--text-light: #9E9087;    /* 淺色文字/標籤 */
--danger: #C0554A;        /* 支出/警示紅 */
--success: #5E9B6A;       /* 收入/成功綠 */
--accent-amber: #C8A96A;  /* 強調琥珀 */
--accent-blue: #8FAFC0;   /* 美股/藍色 */
--accent-purple: #9B8FC0; /* 投資紫 */
```

字體：`'Microsoft JhengHei', 'Noto Sans TC', sans-serif`（index.html 引入 Google Fonts Noto Sans TC）

全域卡片樣式：
- background: var(--milk-card)
- border-radius: 14px
- border: 1px solid rgba(180,160,130,0.35)
- padding: 12px 14px

---

## 二、Layout

### 電腦版（≥768px）— 左側固定側欄

```
┌─────────────┬──────────────────────────────┐
│  側欄 200px  │       主內容區               │
│  bg:#DDD5C8  │       bg:#F5F0E8            │
│             │                              │
│  [奶] logo  │                              │
│  Molly's    │                              │
│  記帳本      │                              │
│             │                              │
│  導覽項目   │                              │
│  • 總覽首頁  │                              │
│  • 手動記帳  │                              │
│  • 消費明細  │                              │
│  • 帳單管理  │                              │
│  • 投資組合  │                              │
│  • 儲蓄目標  │                              │
│  • 設定     │                              │
│             │                              │
│  [用戶資料] │                              │
└─────────────┴──────────────────────────────┘
```

側欄樣式：
- 頂部 logo：深色圓形背景（#2C2820），白色「奶」字，旁邊顯示"Molly's 記帳本"（13px bold）
- 導覽項目：13px，未選中色 #888，選中時背景 rgba(100,80,60,0.15)，文字 #2C2820 bold，左側 5px 深色圓角色條
- 底部用戶：小頭像圓形 + 名稱(12px bold) + email(10px 淺色)
- 分隔線：1px solid rgba(180,160,130,0.28)

### 手機版（<768px）— 底部固定導覽列

```
┌──────────────────────────────┐
│         主內容區              │
│         bg:#F5F0E8           │
│                              │
├──────────────────────────────┤
│  首頁  記帳  投資  目標  設定  │  ← 底部導覽 bg:#DDD5C8 高度60px
└──────────────────────────────┘
```

底部導覽樣式：
- border-top: 1px solid rgba(180,160,130,0.3)
- 每個 tab：圖示(20px) + 文字(10px) 垂直排列
- 未選中：color #9E9087
- 選中：color #2C2820，font-weight 500

---

## 三、首頁（總覽）

頁面標題列：
- 左側："X月總覽"（18px bold #2C2820）
- 右側：日期（12px #9E9087）

### 區塊1：帳戶餘額（一列二欄）

```
┌─────────────────┬─────────────────┐
│  台幣帳戶        │  美金帳戶        │
│  $248,560       │  USD 3,240      │
│  綜合帳戶        │  外幣帳戶        │
└─────────────────┴─────────────────┘
```
- 標籤：11px #9E9087
- 金額：22px bold #2C2820
- 副標：11px #6B5E52

### 區塊2：本月收支（一列三欄）

```
┌──────────┬──────────┬──────────┐
│ 本月支出  │ 本月收入  │ 本月投資  │
│ $28,430  │ $58,000  │ $30,000  │
│↑+8% vs上月│ 固定薪資  │ 台股+美股 │
└──────────┴──────────┴──────────┘
```
- 支出金額：color #C0554A
- 支出副標：color #C0554A，顯示成長百分比
- 收入金額：color #5E9B6A
- 投資金額：color #9B8FC0

### 區塊3：庫存價值（一列二欄）

```
┌─────────────────┬─────────────────┐
│  台股庫存        │  美股庫存        │
│  $186,400       │  USD 4,375      │
│  損益 +$26,400   │  損益 +USD 375  │  ← 綠色小字
└─────────────────┴─────────────────┘
```

### 區塊4：信用卡繳款提醒（四個 banner）

每個 banner 樣式：
```
border-radius: 12px
padding: 10px 14px
margin-bottom: 8px
display: flex
justify-content: space-between
align-items: center
```

餘額足夠：
- background: #FFF3E0
- border: 1px solid rgba(200,169,106,0.4)
- 卡名：12px bold color #7A5A18
- 內文：11px color #9A7A38
- 右側 chip：background #EAF3DE，color #27500A，文字"足夠"

餘額不足：
- background: #FCEBEB
- border: 1px solid rgba(192,85,74,0.35)
- 卡名：12px bold color #791F1F（加上剩餘天數提示）
- 內文：11px color #A32D2D
- 右側 chip：background #FCEBEB border，color #791F1F，文字"不足"

四張卡（依序）：台新 Richart / 國泰 Cube / 富邦 J / 玉山 Ubear

---

## 四、記帳頁面

### Tab 列樣式
```css
.tab {
  padding: 5px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid rgba(180,160,130,0.4);
  color: #6B5E52;
  background: #F0EAE0;
}
.tab.active {
  background: #2C2820;
  color: white;
  border-color: #2C2820;
}
```

三個 Tab：手動記帳 / 消費明細 / 帳單管理

---

### Tab 1：手動記帳

**金額顯示區：**
```css
.amount-display {
  background: #F0EAE0;
  border: 1px solid rgba(180,160,130,0.45);
  border-radius: 10px;
  padding: 10px 14px;
  text-align: right;
  font-size: 28px;
  font-weight: 700;
  color: #2C2820;
}
```

**數字鍵盤（4x4，背景 #EAE3D8，圓角12px，padding 8px）：**
```
┌────┬────┬────┬────┐
│  7 │  8 │  9 │  ÷ │
├────┼────┼────┼────┤
│  4 │  5 │  6 │  × │
├────┼────┼────┼────┤
│  1 │  2 │  3 │  − │
├────┼────┼────┼────┤
│  % │  0 │  ⌫ │  + │
└────┴────┴────┴────┘
```
每個按鍵樣式：
```css
.key {
  background: #F0EAE0;
  border: 1px solid rgba(180,160,130,0.4);
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #2C2820;
}
.key.operator { color: #6B5E52; }
.key.delete { color: #C0554A; }
```

**類型選擇：** 支出 / 收入（toggle 按鈕）

**主分類（橫向捲動）：**
```css
.cat-pill {
  flex-shrink: 0;
  padding: 5px 14px;
  border-radius: 20px;
  font-size: 12px;
  border: 1px solid rgba(180,160,130,0.4);
  color: #6B5E52;
  background: #F0EAE0;
  white-space: nowrap;
}
.cat-pill.active {
  background: #8B7355;
  color: white;
  border-color: #8B7355;
}
```

主分類清單（照此順序）：女兒 / 飲食 / 交通 / 日用品 / 美容 / 服飾 / 社交 / 娛樂 / 旅遊 / 保險 / 稅金 / 貓咪 / 老公

**小分類（flex-wrap）：**
```css
.subcat-pill {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  border: 1px solid rgba(180,160,130,0.35);
  color: #6B5E52;
  background: #F0EAE0;
}
.subcat-pill.active {
  background: #DDD5C8;
  color: #2C2820;
  font-weight: 700;
}
```

各主分類對應小分類：
- 女兒 → 飲食、玩具、書籍、醫療、衣服、娛樂、用品、學費、托育費
- 飲食 → 三餐、買菜、飲料、咖啡、點心
- 交通 → 停車、加油、罰金、Etag、保養、維修
- 日用品 → 保養品、化妝品、衛生紙、清潔用品、牙膏、洗面乳、垃圾袋、隱眼、其它
- 美容 → 指甲、洗頭、做臉、微整、按摩
- 服飾 → 衣服褲子、內衣內褲、鞋子、飾品、帽子
- 社交 → 請客
- 娛樂 → 活動票券
- 旅遊 → 機票、住宿
- 保險 → 壽險、醫療險、車險
- 稅金 → 所得稅、地價稅、房屋稅、牌照稅、燃料稅
- 貓咪 → 貓砂、罐頭、醫療、用品
- 老公 → 禮物、衣服、代付

**備註欄位：** 選填，placeholder "選填備註..."

**消費方式：**
- 選項：信用卡 / 現金 / 匯款
- 選「信用卡」時，右側出現卡別下拉：台新 Richart / 國泰 Cube / 富邦 J / 玉山 Ubear
- 選「匯款」時，右側出現帳戶下拉：台幣綜合帳戶 / 美金帳戶

**儲存按鈕：**
```css
.save-btn {
  width: 100%;
  background: #2C2820;
  color: white;
  border: none;
  border-radius: 12px;
  padding: 13px;
  font-size: 14px;
  font-weight: 700;
}
```

---

### Tab 2：消費明細

**篩選列（水平排列）：**
- 模式切換下拉：「按月份」/ 「自訂區間」
- 月份選擇器（模式=按月份時顯示）
- 起訖日期雙欄（模式=自訂區間時顯示）
- 類別篩選下拉
- 匯出 Excel 按鈕
- 匯出 PDF 按鈕

**統計卡片（二欄）：**
- 左：期間支出（金額紅色）
- 右：期間收入（金額綠色）

**類別加總列表：**
每列樣式：
```
[類別名稱 52px] [────進度條────] [$金額 60px]
```
- 進度條背景：rgba(180,160,130,0.2)，填充色 #8B7355，高度 6px，圓角
- 點擊列可展開小分類明細（縮排顯示，字體11px）
- 最底部顯示「全部加總」，背景 #DDD5C8，圓角10px，粗體金額

**逐筆明細表格：**
欄位：日期 / 主分類/小分類 / 備註 / 消費方式chip / 金額 / 編輯按鈕
- 消費方式 chip 顏色：信用卡=琥珀、現金=綠、匯款=紫
- 支出金額：紅色 font-weight 700
- 收入金額：綠色 font-weight 700
- 編輯按鈕：小型，背景 rgba(100,80,60,0.1)，圓角8px

**編輯 Modal：**
點編輯按鈕彈出底部滑出視窗（手機）或中央彈窗（電腦）
欄位：日期、主分類、小分類、金額、備註
按鈕：儲存修改（深色背景）+ 刪除（紅色背景）

---

### Tab 3：帳單管理

**上傳區：**
```css
.upload-zone {
  border: 2px dashed rgba(180,160,130,0.5);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: rgba(221,213,200,0.18);
}
```
中間顯示上傳圖示 + "上傳帳單截圖" + "支援多張圖片，AI 自動辨識各卡消費明細"

**辨識結果（依卡別分欄/分卡片）：**

卡片標題列：
- 背景：#DDD5C8
- 卡名：13px bold #2C2820
- 右側：應繳金額（紅色 bold）+ 狀態chip

狀態 chip：
- 已確認：背景 #EAF3DE，色 #27500A，文字"✓ 已確認"
- 待確認：背景 #FAEEDA，色 #633806，文字"✎ 待確認"

每筆消費列：
- 商家名稱 12px bold + 分類/日期 10px 淺色
- 右側：金額（紅色）+ 分類chip
- 自動分類 chip：背景 #EAF3DE，色 #27500A，"✓ 自動"
- 待確認 chip：背景 #FAEEDA，色 #633806，"✎ 確認"

底部合計列：背景 #DDD5C8，圓角，顯示合計應繳金額
確認匯入按鈕：全寬，深色背景

---

## 五、投資頁面

**頂部四格統計卡片：**
```
┌──────────┬──────────┬──────────┬──────────┐
│ 台股庫存  │ 美股庫存  │ 總投入成本│ 未實現損益│
│ $186,400 │ USD 4,375│ $160,000 │ +$26,400 │
│+$26,400  │ +USD 375 │          │ +16.5%   │
│(+16.5%)  │ (+9.4%)  │          │          │
└──────────┴──────────┴──────────┴──────────┘
```

**Tab 切換：** 台股 / 美股（同記帳頁 tab 樣式）

**持股列表（手機版）：**
每列：
```
[代號標籤] [名稱+持股數+均價]  [現價]
           [持股詳情]          [損益% ▾]
```
- 代號標籤：背景 #DDD5C8，圓角8px，44x32px，11px bold
- 損益正：綠色；損益負：紅色
- 點擊展開投入明細：
  日期 / 股數×成本 / 資金來源chip
  資金來源 chip：老婆=藍色，老公=琥珀，女兒=綠色

**持股列表（電腦版）：**
表格格式，欄位：股票代號 / 名稱 / 持股 / 均價 / 現價 / 當日市值 / 損益金額 / 損益% / 展開按鈕
點擊行展開投入明細子表格

**每週投資建議 banner：**
```css
background: #E6F1FB;
border: 1px solid rgba(55,138,221,0.25);
border-radius: 10px;
padding: 10px 14px;
```
標題：12px bold #0C447C
內文：11px #185FA5

---

## 六、儲蓄目標頁面

**目標卡片樣式：**
```css
.goal-card {
  background: #F0EAE0;
  border-radius: 14px;
  border: 1px solid rgba(180,160,130,0.35);
  padding: 14px;
}
```

每個目標卡片內容：
- 頂部：圖示區（40x40 圓角10px，可上傳圖片）+ 目標名稱（14px bold）+ 狀態chip
- 參照帳戶：11px 淺色，顯示"參照：台幣綜合帳戶"或"參照：美金帳戶"
- 已存金額 vs 目標金額：12px #6B5E52
- 百分比：13px bold
- 進度條：高度8px，背景 rgba(180,160,130,0.22)，圓角999px
  - 快達成（>70%）：填充色 #8BAF8B（綠）
  - 進行中（30-70%）：填充色 #C8A96A（琥珀）
  - 剛開始（<30%）：填充色 #8FAFC0（藍）
- 預計達成日期：10px 淺色

狀態 chip：
- 快達成！：背景 #EAF3DE，色 #27500A
- 進行中：背景 #FAEEDA，色 #633806
- 剛開始：背景 #E6F1FB，色 #0C447C

電腦版：三欄 grid
手機版：單欄

新增目標按鈕：全寬，背景 #2C2820，白色文字，圓角12px

---

## 七、設定頁面

**用戶資料卡片：**
圓形頭像（44px）+ 名稱（14px bold）+ email（11px 淺色）

**收支類別管理：**
表格列出所有主分類和對應小分類
每行右側：編輯按鈕 + 刪除按鈕（紅色）
底部：「+ 新增主分類」按鈕

**信用卡管理：**
四張卡各一列：卡名（12px bold）+ 結帳日/繳款日（10px 淺色）+ 自動扣款chip（琥珀色）

**匯出資料區塊：**
說明文字："匯出後寄送至 win29989@gmail.com"
選擇月份下拉 + 選擇資料類型下拉
「匯出 Excel」按鈕 + 「匯出 PDF」按鈕（並排）

---

## 八、通用元件樣式

**小型按鈕（sbtn）：**
```css
background: rgba(100,80,60,0.1);
border: none;
border-radius: 8px;
padding: 5px 12px;
font-size: 11px;
color: #6B5E52;
```

**輸入框（finp）：**
```css
background: #F0EAE0;
border: 1px solid rgba(180,160,130,0.45);
border-radius: 10px;
padding: 9px 12px;
font-size: 13px;
color: #2C2820;
font-family: inherit;
outline: none;
```

**分隔線：**
```css
height: 1px;
background: rgba(180,160,130,0.25);
margin: 8px 0;
```

**Chip 元件：**
```css
.chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.chip-green { background: #EAF3DE; color: #27500A; }
.chip-amber { background: #FAEEDA; color: #633806; }
.chip-blue  { background: #E6F1FB; color: #0C447C; }
.chip-red   { background: #FCEBEB; color: #791F1F; }
.chip-purple{ background: #EEEDFE; color: #3C3489; }
```

**頁面標題列樣式：**
```css
.page-title {
  padding: 14px 18px 8px;
  font-size: 18px;
  font-weight: 700;
  color: #2C2820;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

---

## 九、PWA 設定

```json
// public/manifest.json
{
  "name": "Molly's 記帳本",
  "short_name": "記帳本",
  "theme_color": "#DDD5C8",
  "background_color": "#F5F0E8",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/"
}
```

index.html viewport：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

---

## 十、執行指示

請完整重寫以下檔案的樣式與結構：
1. src/index.css — 全域樣式與 CSS 變數
2. src/components/Layout.tsx — 側欄與底部導覽
3. src/pages/HomePage.tsx — 首頁四個區塊
4. src/pages/AddPage.tsx — 記帳三個 Tab
5. src/pages/RecordsPage.tsx — 消費明細
6. src/pages/StatsPage.tsx — 投資頁面
7. src/pages/SettingsPage.tsx — 設定頁面

確保所有顏色、字體大小、間距、圓角、邊框完全符合本規格書。
