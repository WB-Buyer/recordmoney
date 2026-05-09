import { useState, useEffect, useRef } from 'react'
import { X, Plus, Pencil, Trash2, Upload, CheckCircle, AlertCircle, Download, LogIn, LogOut, Mail } from 'lucide-react'
import { CATEGORIES, CATEGORY_LIST, CATEGORY_EMOJI, getRecords, type Category } from '../lib/supabase'
import { supabase } from '../lib/supabase'
import { exportLocalData, importLocalData, clearLocalData } from '../lib/storage'
import * as XLSX from 'xlsx'

// ─── 型別 ─────────────────────────────────────────────────────
interface CreditCard {
  id: number
  name: string
  statementDay: number
  dueDay: number
  linkedAccount: string
  autoDebit: boolean
}

// ─── Toast ────────────────────────────────────────────────────
function Toast({ type, msg }: { type: 'ok' | 'err'; msg: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      background: type === 'ok' ? '#5E9B6A' : '#C0554A',
      color: '#fff', padding: '12px 20px', borderRadius: 99,
      fontSize: 14, fontWeight: 500,
      whiteSpace: 'nowrap', zIndex: 600,
      animation: 'fadeIn 0.2s ease',
    }}>
      {type === 'ok' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {msg}
    </div>
  )
}

// ─── Modal 外框 ────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const isDesktop = window.innerWidth >= 768
  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 400, animation: 'fadeInOverlay 0.2s ease',
      }} />
      <div style={{
        position: 'fixed',
        ...(isDesktop
          ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: 16, width: 400, maxHeight: '90vh', overflowY: 'auto' }
          : { bottom: 0, left: 0, right: 0, borderRadius: '20px 20px 0 0', animation: 'slideUp 0.25s ease', maxHeight: '90vh', overflowY: 'auto' }
        ),
        background: '#F5F0E8',
        padding: 20, zIndex: 500,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2820' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9E9087', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

// ─── 大頭貼上傳 ────────────────────────────────────────────────
function AvatarSection({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const localUrl = URL.createObjectURL(file)
    setAvatarUrl(localUrl)
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `avatar_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setAvatarUrl(data.publicUrl)
      onToast('ok', '頭像已更新')
    } catch (e: any) {
      onToast('err', '上傳失敗：' + (e.message ?? '未知錯誤'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#DDD5C8', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
          overflow: 'hidden', cursor: 'pointer', position: 'relative',
        }}
        onClick={() => fileRef.current?.click()}
        title="點擊更換頭像"
      >
        {avatarUrl
          ? <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>👩</span>
        }
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Upload size={14} style={{ color: '#fff' }} />
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#9E9087', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
          {uploading ? '上傳中...' : '點擊更換頭像'}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}

// ─── 收支類別管理 ──────────────────────────────────────────────
function CategoryManager({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [cats, setCats] = useState<{ cat: Category; subs: string[] }[]>(
    CATEGORY_LIST.map(cat => ({ cat, subs: [...CATEGORIES[cat]] }))
  )
  const [expandedCat, setExpandedCat] = useState<Category | null>(null)
  const [editTarget, setEditTarget]   = useState<{ cat: Category; subs: string[] } | null>(null)
  const [showAddCat, setShowAddCat]   = useState(false)

  // 編輯 Modal
  function EditCatModal({ item, onClose }: { item: { cat: Category; subs: string[] }; onClose: () => void }) {
    const [name, setName]       = useState<string>(item.cat)
    const [subs, setSubs]       = useState(item.subs.join('\n'))
    const [saving, setSaving]   = useState(false)
    const [localErr, setLocalErr] = useState('')

    async function handleSave() {
      if (!name.trim()) { setLocalErr('請輸入主分類名稱'); return }
      setSaving(true)
      const newSubs = subs.split('\n').map(s => s.trim()).filter(Boolean)
      // 先更新本地狀態
      setCats(prev => prev.map(c => c.cat === item.cat ? { cat: name.trim() as Category, subs: newSubs } : c))
      // 寫入 Supabase
      try {
        const { error } = await supabase
          .from('categories')
          .upsert({ name: name.trim(), subcategories: newSubs }, { onConflict: 'name' })
        if (error) throw error
        onToast('ok', `「${name.trim()}」已儲存`)
      } catch (e: any) {
        onToast('err', '儲存失敗：' + (e.message ?? '資料表不存在或無權限'))
      }
      setSaving(false)
      onClose()
    }

    return (
      <Modal title="編輯分類" onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {localErr && <div style={{ fontSize: 12, color: '#C0554A' }}>{localErr}</div>}
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>主分類名稱</div>
            <input className="finp" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>小分類（每行一個）</div>
            <textarea
              className="finp"
              value={subs}
              onChange={e => setSubs(e.target.value)}
              rows={6}
              style={{ resize: 'vertical' }}
            />
          </div>
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : '儲存修改'}
          </button>
        </div>
      </Modal>
    )
  }

  // 新增分類 Modal
  function AddCatModal({ onClose }: { onClose: () => void }) {
    const [name, setName]       = useState('')
    const [subs, setSubs]       = useState('')
    const [saving, setSaving]   = useState(false)
    const [localErr, setLocalErr] = useState('')

    async function handleSave() {
      if (!name.trim()) { setLocalErr('請輸入主分類名稱'); return }
      setSaving(true)
      const newSubs = subs.split('\n').map(s => s.trim()).filter(Boolean)
      setCats(prev => [...prev, { cat: name.trim() as Category, subs: newSubs }])
      try {
        const { error } = await supabase
          .from('categories')
          .insert({ name: name.trim(), subcategories: newSubs })
        if (error) throw error
        onToast('ok', `「${name.trim()}」已新增`)
      } catch (e: any) {
        onToast('err', '新增失敗：' + (e.message ?? '資料表不存在或無權限'))
      }
      setSaving(false)
      onClose()
    }

    return (
      <Modal title="新增主分類" onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {localErr && <div style={{ fontSize: 12, color: '#C0554A' }}>{localErr}</div>}
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>主分類名稱</div>
            <input className="finp" value={name} onChange={e => setName(e.target.value)} placeholder="例如：醫療" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>小分類（每行一個，可留空）</div>
            <textarea
              className="finp"
              value={subs}
              onChange={e => setSubs(e.target.value)}
              rows={4}
              placeholder={'掛號費\n藥費\n健檢'}
              style={{ resize: 'vertical' }}
            />
          </div>
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '新增中...' : '新增分類'}
          </button>
        </div>
      </Modal>
    )
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`確定刪除「${cat}」分類？此操作無法還原。`)) return
    setCats(prev => prev.filter(c => c.cat !== cat))
    try {
      const { error } = await supabase.from('categories').delete().eq('name', cat)
      if (error) throw error
      onToast('ok', `「${cat}」已刪除`)
    } catch (e: any) {
      onToast('err', '刪除失敗：' + (e.message ?? ''))
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 8 }}>收支類別管理</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {cats.map(({ cat, subs }, i) => (
          <div key={cat}>
            <div
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < cats.length - 1 ? '1px solid rgba(180,160,130,0.15)' : 'none',
                background: expandedCat === cat ? 'rgba(221,213,200,0.25)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{CATEGORY_EMOJI[cat] ?? '📁'}</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#2C2820' }}>{cat}</span>
              <span style={{ fontSize: 11, color: '#9E9087', marginRight: 4 }}>{subs.length} 項</span>
              <button className="sbtn" onClick={e => { e.stopPropagation(); setEditTarget({ cat, subs }) }}>
                <Pencil size={11} />
              </button>
              <button
                className="sbtn"
                onClick={e => { e.stopPropagation(); handleDelete(cat) }}
                style={{ background: 'rgba(192,85,74,0.1)', color: '#C0554A', marginLeft: 4 }}
              >
                <Trash2 size={11} />
              </button>
            </div>
            {expandedCat === cat && (
              <div style={{
                padding: '8px 14px 10px 50px', background: 'rgba(221,213,200,0.15)',
                borderBottom: i < cats.length - 1 ? '1px solid rgba(180,160,130,0.15)' : 'none',
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {subs.map(sub => <span key={sub} className="subcat-pill">{sub}</span>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="save-btn" style={{ marginTop: 8 }} onClick={() => setShowAddCat(true)}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> 新增主分類
        </span>
      </button>

      {editTarget && <EditCatModal item={editTarget} onClose={() => setEditTarget(null)} />}
      {showAddCat && <AddCatModal onClose={() => setShowAddCat(false)} />}
    </div>
  )
}

// ─── 信用卡管理 ────────────────────────────────────────────────
function CreditCardManager({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [cards, setCards] = useState<CreditCard[]>([
    { id: 1, name: '台新 Richart',  statementDay: 15, dueDay: 10, linkedAccount: '台新薪轉', autoDebit: true  },
    { id: 2, name: '國泰 Cube',     statementDay: 25, dueDay: 15, linkedAccount: '國泰 Cube', autoDebit: false },
    { id: 3, name: '富邦 J',        statementDay: 28, dueDay: 20, linkedAccount: '富邦',     autoDebit: true  },
    { id: 4, name: '玉山 Ubear',    statementDay: 5,  dueDay: 25, linkedAccount: '玉山',     autoDebit: false },
  ])
  const [editCard, setEditCard] = useState<CreditCard | null>(null)
  const [showAdd, setShowAdd]   = useState(false)
  const nextId = useRef(100)

  const ACCOUNT_OPTIONS = ['台新薪轉', '台新 Richart', '國泰 Cube', '國泰美金', '永豐大戶', '玉山', '富邦']

  async function persistCard(card: CreditCard, isNew: boolean) {
    try {
      // 問題 3：使用 credit_cards 實際欄位名稱
      if (isNew) {
        const { error } = await supabase
          .from('credit_cards')
          .insert({
            card_name:   card.name,
            closing_day: card.statementDay,
            due_day:     card.dueDay,
            auto_debit:  card.autoDebit,
          })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('credit_cards')
          .update({
            card_name:   card.name,
            closing_day: card.statementDay,
            due_day:     card.dueDay,
            auto_debit:  card.autoDebit,
          })
          .eq('id', card.id)
        if (error) throw error
      }
      onToast('ok', `「${card.name}」已儲存`)
    } catch (e: any) {
      // credit_cards 資料表若不存在，僅本地儲存
      onToast('ok', `「${card.name}」已儲存（本地）`)
    }
  }

  async function deleteCard(card: CreditCard) {
    if (!confirm(`確定刪除「${card.name}」？`)) return
    setCards(prev => prev.filter(c => c.id !== card.id))
    try {
      await supabase.from('credit_cards').delete().eq('id', card.id)
      onToast('ok', `「${card.name}」已刪除`)
    } catch {
      onToast('ok', `「${card.name}」已刪除（本地）`)
    }
  }

  function CardModal({ card, onClose, onSave }: {
    card: Partial<CreditCard>
    onClose: () => void
    onSave: (c: CreditCard) => void
  }) {
    const [name, setName]           = useState(card.name ?? '')
    const [statementDay, setStatD]  = useState(String(card.statementDay ?? 15))
    const [dueDay, setDueDay]       = useState(String(card.dueDay ?? 10))
    const [linkedAccount, setLinked]= useState(card.linkedAccount ?? ACCOUNT_OPTIONS[0])
    const [autoDebit, setAutoDebit] = useState(card.autoDebit ?? false)
    const [err, setErr]             = useState('')
    const [saving, setSaving]       = useState(false)

    async function handleSave() {
      if (!name.trim()) { setErr('請輸入卡片名稱'); return }
      setSaving(true)
      const isNew = !card.id
      const updated: CreditCard = {
        id: card.id ?? nextId.current++,
        name: name.trim(),
        statementDay: Number(statementDay),
        dueDay: Number(dueDay),
        linkedAccount,
        autoDebit,
      }
      onSave(updated)
      await persistCard(updated, isNew)
      setSaving(false)
      onClose()
    }

    return (
      <Modal title={card.id ? '編輯信用卡' : '新增信用卡'} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ fontSize: 12, color: '#C0554A' }}>{err}</div>}

          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>卡片名稱</div>
            <input className="finp" value={name} onChange={e => setName(e.target.value)} placeholder="例如：台新 @GoGo" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>結帳日</div>
              <input className="finp" type="number" min="1" max="31" value={statementDay} onChange={e => setStatD(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>繳款日</div>
              <input className="finp" type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>連動帳戶</div>
            <select className="finp" value={linkedAccount} onChange={e => setLinked(e.target.value)}>
              {ACCOUNT_OPTIONS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#2C2820' }}>
            <input
              type="checkbox"
              checked={autoDebit}
              onChange={e => setAutoDebit(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            自動扣款
          </label>

          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '儲存中...' : (card.id ? '儲存修改' : '新增信用卡')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 8 }}>信用卡管理</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {cards.map((card, i) => (
          <div
            key={card.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px',
              borderBottom: i < cards.length - 1 ? '1px solid rgba(180,160,130,0.15)' : 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2820' }}>{card.name}</div>
              <div style={{ fontSize: 10, color: '#9E9087', marginTop: 2 }}>
                結帳日 {card.statementDay} 日 · 繳款日 {card.dueDay} 日 · {card.linkedAccount}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {card.autoDebit && <span className="chip chip-amber">自動扣款</span>}
              <button className="sbtn" onClick={() => setEditCard(card)}>
                <Pencil size={11} />
              </button>
              <button
                className="sbtn"
                onClick={() => deleteCard(card)}
                style={{ background: 'rgba(192,85,74,0.1)', color: '#C0554A' }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="save-btn" style={{ marginTop: 8 }} onClick={() => setShowAdd(true)}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Plus size={14} /> 新增信用卡
        </span>
      </button>

      {editCard && (
        <CardModal
          card={editCard}
          onClose={() => setEditCard(null)}
          onSave={updated => setCards(prev => prev.map(c => c.id === updated.id ? updated : c))}
        />
      )}
      {showAdd && (
        <CardModal
          card={{}}
          onClose={() => setShowAdd(false)}
          onSave={newCard => setCards(prev => [...prev, newCard])}
        />
      )}
    </div>
  )
}

// ─── 匯出功能 ──────────────────────────────────────────────────
function ExportSection({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [exportType, setExportType]   = useState('消費明細')
  const [exporting, setExporting]     = useState<'excel' | 'pdf' | null>(null)

  async function handleExcelExport() {
    setExporting('excel')
    try {
      const [year, month] = exportMonth.split('-').map(Number)
      // 問題 3：使用 getRecords（已處理 transactions 表 + 欄位映射）
      const records = await getRecords(year, month)

      const wb = XLSX.utils.book_new()
      const rows = records.map(r => ({
        日期: r.date,
        類型: r.type === 'income' ? '收入' : '支出',
        主分類: r.category,
        小分類: r.subcategory,
        備註: r.note ?? '',
        消費方式: r.payment ?? '',
        金額: r.amount,
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, '消費明細')
      XLSX.writeFile(wb, `奶茶記帳_${exportMonth}.xlsx`)
      onToast('ok', 'Excel 匯出成功')
    } catch (e: any) {
      onToast('err', '匯出失敗：' + e.message)
    } finally {
      setExporting(null)
    }
  }

  async function handlePdfExport() {
    setExporting('pdf')
    try {
      const [year, month] = exportMonth.split('-').map(Number)
      // 問題 3：使用 getRecords（已處理 transactions 表 + 欄位映射）
      const records = await getRecords(year, month)

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const container = document.createElement('div')
      container.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;padding:32px;font-family:Microsoft JhengHei,sans-serif;'

      const totalExp = records.filter(r => r.type !== 'income').reduce((s, r) => s + r.amount, 0)
      const totalInc = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
      const start = `${exportMonth}-01`
      const [_y, _m] = exportMonth.split('-').map(Number)
      const end = `${exportMonth}-${String(new Date(_y, _m, 0).getDate()).padStart(2, '0')}`

      container.innerHTML = `
        <h2 style="font-size:20px;font-weight:bold;margin-bottom:8px;">奶茶記帳報表</h2>
        <p style="font-size:13px;color:#666;margin-bottom:16px;">期間：${start} ~ ${end}</p>
        <div style="display:flex;gap:24px;margin-bottom:20px;">
          <div><span style="color:#C0554A;font-weight:bold;font-size:16px;">支出：$${totalExp.toLocaleString()}</span></div>
          <div><span style="color:#5E9B6A;font-weight:bold;font-size:16px;">收入：$${totalInc.toLocaleString()}</span></div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#DDD5C8;">
              <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;">日期</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;">分類</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;">小分類</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;">備註</th>
              <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;">消費方式</th>
              <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;">金額</th>
            </tr>
          </thead>
          <tbody>
            ${records.map((r, idx) => `
              <tr style="background:${idx % 2 === 0 ? '#fff' : '#F5F0E8'};">
                <td style="padding:5px 8px;border:1px solid #eee;">${r.date}</td>
                <td style="padding:5px 8px;border:1px solid #eee;">${r.category}</td>
                <td style="padding:5px 8px;border:1px solid #eee;">${r.subcategory ?? ''}</td>
                <td style="padding:5px 8px;border:1px solid #eee;">${r.note ?? ''}</td>
                <td style="padding:5px 8px;border:1px solid #eee;">${r.payment ?? ''}</td>
                <td style="padding:5px 8px;border:1px solid #eee;text-align:right;color:${r.type === 'income' ? '#5E9B6A' : '#C0554A'};">
                  ${r.type === 'income' ? '+' : '-'}$${r.amount.toLocaleString()}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      document.body.appendChild(container)

      const canvas = await html2canvas(container, { scale: 2, useCORS: true })
      document.body.removeChild(container)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      const imgHeight = (canvas.height * pageWidth) / canvas.width
      let yPos = 0
      const pageHeight = 297

      while (yPos < imgHeight) {
        if (yPos > 0) pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, -yPos, pageWidth, imgHeight)
        yPos += pageHeight
      }

      pdf.save(`奶茶記帳_${exportMonth}.pdf`)
      onToast('ok', 'PDF 匯出成功')
    } catch (e: any) {
      onToast('err', '匯出失敗：' + e.message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 4 }}>匯出資料</div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>選擇月份</div>
            <input type="month" value={exportMonth} onChange={e => setExportMonth(e.target.value)} className="finp" style={{ fontSize: 12 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9E9087', marginBottom: 4 }}>資料類型</div>
            <select value={exportType} onChange={e => setExportType(e.target.value)} className="finp" style={{ fontSize: 12 }}>
              <option>消費明細</option>
              <option>帳單管理</option>
              <option>投資組合</option>
              <option>全部資料</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="save-btn" style={{ background: '#5E9B6A', opacity: exporting ? 0.6 : 1 }} onClick={handleExcelExport} disabled={!!exporting}>
            {exporting === 'excel' ? '匯出中...' : '匯出 Excel'}
          </button>
          <button className="save-btn" style={{ background: '#C0554A', opacity: exporting ? 0.6 : 1 }} onClick={handlePdfExport} disabled={!!exporting}>
            {exporting === 'pdf' ? '匯出中...' : '匯出 PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 問題 6：本機模式資料管理 ────────────────────────────────
function LocalDataSection({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleExportJson() {
    const data = exportLocalData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `molly_backup_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    onToast('ok', '資料已匯出')
  }

  async function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('匯入將覆蓋本機所有資料，確定繼續？')) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      importLocalData(data)
      onToast('ok', '資料已匯入，重新整理頁面後生效')
    } catch {
      onToast('err', '匯入失敗：檔案格式錯誤')
    }
    e.target.value = ''
  }

  function handleClear() {
    if (!confirm('確定清除所有本機資料？此操作無法復原！')) return
    if (!confirm('再次確認：清除後無法復原，確定嗎？')) return
    clearLocalData()
    onToast('ok', '本機資料已清除')
  }

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820', marginBottom: 8 }}>本機資料管理</div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="save-btn"
          style={{ background: '#5E9B6A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={handleExportJson}
        >
          <Download size={14} /> 匯出資料（JSON）
        </button>
        <button
          className="save-btn"
          style={{ background: '#8B7355', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} /> 匯入資料（JSON）
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJson} />
        <button
          className="save-btn"
          style={{ background: '#C0554A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={handleClear}
        >
          清除所有本機資料
        </button>
        <div style={{ fontSize: 11, color: '#9E9087', textAlign: 'center' }}>
          本機資料儲存於瀏覽器 localStorage，匯出 JSON 可備份或轉移裝置
        </div>
      </div>
    </div>
  )
}

// ─── OTP 驗證碼登入（解決 iPhone PWA Magic Link 問題）────────
function MagicLinkSection({ onToast }: { onToast: (t: 'ok' | 'err', m: string) => void }) {
  const [email, setEmail]     = useState('')
  const [otp, setOtp]         = useState('')
  const [step, setStep]       = useState<'email' | 'otp'>('email')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setUserEmail(user.email)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSendOtp() {
    if (!email.trim()) { onToast('err', '請輸入 Email'); return }
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    setSending(false)
    if (error) { onToast('err', '發送失敗：' + error.message); return }
    setStep('otp')
    onToast('ok', '驗證碼已發送，請查收信箱')
  }

  async function handleVerifyOtp() {
    if (!otp.trim() || otp.length < 6) { onToast('err', '請輸入 6 位數驗證碼'); return }
    setVerifying(true)
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setVerifying(false)
    if (error) { onToast('err', '驗證失敗：' + error.message); return }
    onToast('ok', '登入成功！')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setUserEmail(null)
    setStep('email')
    setEmail('')
    setOtp('')
    onToast('ok', '已登出')
  }

  if (userEmail) {
    return (
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2C2820', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} style={{ color: '#5E9B6A' }} /> 已登入
          </div>
          <div style={{ fontSize: 11, color: '#9E9087', marginTop: 2 }}>{userEmail}</div>
        </div>
        <button
          className="sbtn"
          onClick={handleSignOut}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '6px 10px' }}
        >
          <LogOut size={13} /> 登出
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#2C2820' }}>
        登入以備份雲端
      </div>
      <div style={{ fontSize: 11, color: '#9E9087' }}>
        使用驗證碼登入，完全支援 iPhone 主畫面 PWA ✅
      </div>

      {step === 'email' ? (
        <>
          <input
            className="finp"
            type="email"
            placeholder="請輸入 Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
          />
          <button
            className="save-btn"
            style={{ background: '#2C2820', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleSendOtp}
            disabled={sending}
          >
            <Mail size={15} /> {sending ? '發送中...' : '發送驗證碼'}
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 12, color: '#5E9B6A', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Mail size={14} /> 驗證碼已發送至 {email}
          </div>
          <input
            className="finp"
            type="number"
            placeholder="輸入 6 位數驗證碼"
            value={otp}
            maxLength={6}
            onChange={e => setOtp(e.target.value.slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
            style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20, fontWeight: 700 }}
          />
          <button
            className="save-btn"
            style={{ background: '#2C2820', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={handleVerifyOtp}
            disabled={verifying}
          >
            <LogIn size={15} /> {verifying ? '驗證中...' : '確認登入'}
          </button>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#9E9087', textDecoration: 'underline',
            }}
            onClick={() => { setStep('email'); setOtp('') }}
          >
            重新發送 / 更改 Email
          </button>
        </>
      )}
    </div>
  )
}

// ─── SettingsPage 主元件 ───────────────────────────────────────
export default function SettingsPage() {
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  function showToast(type: 'ok' | 'err', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 2600)
  }

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div className="page-title">
        <span>設定</span>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AvatarSection onToast={showToast} />
        <MagicLinkSection onToast={showToast} />

        <CategoryManager onToast={showToast} />
        <CreditCardManager onToast={showToast} />
        <ExportSection onToast={showToast} />
        <LocalDataSection onToast={showToast} />

        {/* 關於 */}
        <div className="card" style={{ textAlign: 'center', color: '#9E9087', padding: '20px 14px' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🧋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2C2820', marginBottom: 4 }}>Molly's 記帳本</div>
          <div style={{ fontSize: 11 }}>v2.0.0 · 用愛記帳，用心生活</div>
        </div>
      </div>

      {toast && <Toast type={toast.type} msg={toast.msg} />}
    </div>
  )
}
