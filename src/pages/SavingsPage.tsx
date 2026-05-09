import { useState, useEffect } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { getAccounts, updateAccountBalance, pullFromSupabase, type LocalAccount } from '../lib/localDB'

// ─── Toast ─────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
      background: type === 'ok' ? '#5E9B6A' : '#C0554A',
      color: '#fff', padding: '12px 20px', borderRadius: 99,
      fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', zIndex: 600,
    }}>{msg}</div>
  )
}

// ─── 單一帳戶列 ────────────────────────────────────────────────
function AccountRow({
  account,
  onSave,
}: {
  account: LocalAccount
  onSave: (id: string, balance: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(String(account.balance))

  const symbol = account.currency === 'USD' ? 'USD ' : '$'

  function handleConfirm() {
    const n = parseFloat(val)
    if (isNaN(n)) { setVal(String(account.balance)); setEditing(false); return }
    onSave(account.id, n)
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid rgba(180,160,130,0.2)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#2C2820' }}>{account.name}</div>
        <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2 }}>{account.currency}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {editing ? (
          <>
            <input
              type="number"
              value={val}
              onChange={e => setVal(e.target.value)}
              style={{
                width: 120, padding: '6px 10px', borderRadius: 8,
                border: '1.5px solid #DDD5C8', background: '#FAF6F0',
                fontSize: 14, fontFamily: 'inherit', textAlign: 'right',
              }}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') setEditing(false) }}
            />
            <button
              onClick={handleConfirm}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5E9B6A', padding: 4 }}
            >
              <Check size={16} />
            </button>
            <button
              onClick={() => { setVal(String(account.balance)); setEditing(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C0554A', padding: 4 }}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>
              {symbol}{account.balance.toLocaleString()}
            </span>
            <button
              onClick={() => { setVal(String(account.balance)); setEditing(true) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9087', padding: 4 }}
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── SavingsPage 主元件（帳戶總覽）────────────────────────────
export default function SavingsPage() {
  const [accounts, setAccounts] = useState<LocalAccount[]>(() => getAccounts())
  const [toast, setToast]       = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2400)
  }

  useEffect(() => {
    // 背景從雲端更新（有登入才執行）
    pullFromSupabase().then(() => {
      setAccounts(getAccounts())
    }).catch(() => {})
  }, [])

  function handleSave(id: string, balance: number) {
    updateAccountBalance(id, balance)
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, balance } : a))
    showToast('餘額已更新')
  }

  const twdAccounts = accounts.filter(a => a.currency === 'TWD')
  const usdAccounts = accounts.filter(a => a.currency === 'USD')
  const totalTWD    = twdAccounts.reduce((s, a) => s + a.balance, 0)
  const totalUSD    = usdAccounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="page-title">
        <span>帳戶總覽</span>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* 總計 summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>台幣帳戶總計</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820' }}>${totalTWD.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>{twdAccounts.length} 個帳戶</div>
          </div>
          <div className="card">
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>美金帳戶總計</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2820' }}>USD {totalUSD.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>{usdAccounts.length} 個帳戶</div>
          </div>
        </div>

        {/* 台幣帳戶 */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5E52', marginBottom: 4 }}>🏦 台幣帳戶</div>
          {twdAccounts.map(a => (
            <AccountRow key={a.id} account={a} onSave={handleSave} />
          ))}
        </div>

        {/* 美金帳戶 */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B5E52', marginBottom: 4 }}>💵 美金帳戶</div>
          {usdAccounts.map(a => (
            <AccountRow key={a.id} account={a} onSave={handleSave} />
          ))}
        </div>

        {/* 說明 */}
        <div style={{
          background: 'rgba(221,213,200,0.3)', borderRadius: 10,
          padding: '10px 14px', fontSize: 11, color: '#9E9087',
        }}>
          點擊鉛筆圖示可直接編輯各帳戶餘額。匯款/轉帳記帳時會從對應帳戶自動扣款。
        </div>

      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
