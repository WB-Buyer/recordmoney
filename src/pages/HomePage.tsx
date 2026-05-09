import { format } from 'date-fns'

const now = new Date()
const monthLabel = `${now.getMonth() + 1}月總覽`
const dateLabel = format(now, 'yyyy/MM/dd')

export default function HomePage() {
  return (
    <div style={{ padding: '0 0 16px' }}>
      {/* 頁面標題 */}
      <div className="page-title">
        <span>{monthLabel}</span>
        <span style={{ fontSize: 12, color: '#9E9087', fontWeight: 400 }}>{dateLabel}</span>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 區塊1：帳戶餘額 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>台幣帳戶</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2C2820', lineHeight: 1.2 }}>$0</div>
            <div style={{ fontSize: 11, color: '#6B5E52', marginTop: 4 }}>綜合帳戶</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>美金帳戶</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2C2820', lineHeight: 1.2 }}>USD 0</div>
            <div style={{ fontSize: 11, color: '#6B5E52', marginTop: 4 }}>外幣帳戶</div>
          </div>
        </div>

        {/* 區塊2：本月收支 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>本月支出</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#C0554A', lineHeight: 1.2 }}>$0</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 4 }}>尚無記錄</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>本月收入</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#5E9B6A', lineHeight: 1.2 }}>$0</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 4 }}>尚無記錄</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>本月投資</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#9B8FC0', lineHeight: 1.2 }}>$0</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 4 }}>尚無記錄</div>
          </div>
        </div>

        {/* 區塊3：庫存價值 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>台股庫存</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820', lineHeight: 1.2 }}>$0</div>
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 4 }}>尚無持股</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>美股庫存</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820', lineHeight: 1.2 }}>USD 0</div>
            <div style={{ fontSize: 11, color: '#9E9087', marginTop: 4 }}>尚無持股</div>
          </div>
        </div>

        {/* 區塊4：信用卡繳款提醒 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 8 }}>信用卡繳款提醒</div>
          <div style={{
            borderRadius: 12,
            padding: '20px 14px',
            textAlign: 'center',
            background: '#F0EAE0',
            border: '1px solid rgba(180,160,130,0.3)',
            color: '#9E9087',
            fontSize: 13,
          }}>
            尚無信用卡帳單資料
          </div>
        </div>

      </div>
    </div>
  )
}
