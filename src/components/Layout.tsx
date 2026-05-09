import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, PenLine, List, Receipt, TrendingUp, Target, Settings, CreditCard } from 'lucide-react'
import { shouldWarnSessionExpiry, isSessionExpired, getSessionDaysLeft } from '../lib/localDB'

const sidebarItems = [
  { to: '/',        label: '總覽首頁', Icon: Home,       exact: true },
  { to: '/add',     label: '手動記帳', Icon: PenLine,    exact: false },
  { to: '/add?tab=records', label: '消費明細', Icon: List, exact: false, navTo: '/add', param: 'records' },
  { to: '/add?tab=bills',   label: '帳單管理', Icon: Receipt, exact: false, navTo: '/add', param: 'bills' },
  { to: '/credit-card-summary', label: '信用卡總覽', Icon: CreditCard, exact: false },
  { to: '/stats',   label: '投資組合', Icon: TrendingUp,  exact: false },
  { to: '/savings', label: '帳戶總覽', Icon: Target,      exact: false },
  { to: '/settings',label: '設定',    Icon: Settings,    exact: false },
]

const bottomNavItems = [
  { to: '/',        label: '首頁', Icon: Home,       exact: true },
  { to: '/add',     label: '記帳', Icon: PenLine,    exact: false },
  { to: '/stats',   label: '投資', Icon: TrendingUp, exact: false },
  { to: '/savings', label: '帳戶', Icon: Target,     exact: false },
  { to: '/settings',label: '設定', Icon: Settings,   exact: false },
]

function SessionWarningBar() {
  const [show, setShow] = useState(false)
  const [days, setDays] = useState<number | null>(null)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const d = getSessionDaysLeft()
    setDays(d)
    setShow(shouldWarnSessionExpiry() || isSessionExpired())
    setExpired(isSessionExpired())
  }, [])

  if (!show) return null

  return (
    <div style={{
      background: expired ? '#C0554A' : '#C8A96A',
      color: '#fff',
      padding: '8px 16px',
      fontSize: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      flexShrink: 0,
    }}>
      <span>
        {expired
          ? '☁️ 雲端備份已暫停，本機資料正常'
          : `☁️ 雲端備份將於 ${days} 天後到期`}
      </span>
      <button
        onClick={() => window.location.href = '/settings'}
        style={{
          background: 'rgba(255,255,255,0.25)',
          border: 'none', borderRadius: 6,
          color: '#fff', padding: '3px 10px',
          fontSize: 11, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {expired ? '重新連線' : '立即續期'}
      </button>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  function isActive(item: typeof sidebarItems[0]) {
    if (item.param) {
      return location.pathname === '/add' && location.search === `?tab=${item.param}`
    }
    if (item.exact) return location.pathname === item.to
    if (item.to === '/add') {
      return location.pathname === '/add' && !location.search
    }
    return location.pathname.startsWith(item.to)
  }

  function isBottomActive(item: typeof bottomNavItems[0]) {
    if (item.exact) return location.pathname === '/'
    return location.pathname.startsWith(item.to)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>

      <SessionWarningBar />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

      {/* ── 電腦側欄 ── */}
      <aside className="desktop-sidebar">
        <div className="divider" style={{ margin: '12px 12px 8px' }} />

        {/* 導覽 */}
        <nav className="sidebar-nav">
          {sidebarItems.map((item) => {
            const active = isActive(item)
            const dest = item.param ? `/add?tab=${item.param}` : item.to
            return (
              <button
                key={dest}
                onClick={() => navigate(dest)}
                className={`sidebar-item${active ? ' active' : ''}`}
              >
                {active && <div className="sidebar-active-bar" />}
                <item.Icon size={15} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

      </aside>

      {/* ── 主內容區 ── */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* ── 手機底部導覽 ── */}
      <nav className="bottom-nav">
        {bottomNavItems.map(({ to, label, Icon, exact }) => {
          const active = isBottomActive({ to, label, Icon, exact })
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={`bottom-nav-item${active ? ' active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      </div>{/* end flex row */}

      <style>{`
        /* 側欄 */
        .desktop-sidebar {
          display: none;
        }
        @media (min-width: 768px) {
          .desktop-sidebar {
            display: flex;
            flex-direction: column;
            width: 200px;
            min-height: 100svh;
            background: #DDD5C8;
            border-right: 1px solid rgba(180,160,130,0.28);
            position: sticky;
            top: 0;
            flex-shrink: 0;
            height: 100svh;
            overflow-y: auto;
          }
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 20px 14px 14px;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 4px 8px;
        }

        .sidebar-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px 9px 16px;
          border-radius: 8px;
          color: #888;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          background: transparent;
          border: none;
          font-family: inherit;
          text-align: left;
          width: 100%;
          transition: background 0.15s, color 0.15s;
        }
        .sidebar-item:hover {
          background: rgba(100,80,60,0.1);
          color: #2C2820;
        }
        .sidebar-item.active {
          background: rgba(100,80,60,0.15);
          color: #2C2820;
          font-weight: 700;
        }
        .sidebar-active-bar {
          position: absolute;
          left: 6px;
          top: 50%;
          transform: translateY(-50%);
          width: 4px;
          height: 18px;
          background: #2C2820;
          border-radius: 2px;
        }

        .sidebar-user {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 14px 16px;
        }

        /* 主內容 */
        .main-content {
          flex: 1;
          overflow-y: auto;
          padding-bottom: 68px;
          min-width: 0;
        }
        @media (min-width: 768px) {
          .main-content {
            padding-bottom: 0;
          }
        }

        /* 手機底部導覽 */
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 60px;
          background: #DDD5C8;
          border-top: 1px solid rgba(180,160,130,0.3);
          display: flex;
          align-items: center;
          justify-content: space-around;
          z-index: 100;
          padding-bottom: env(safe-area-inset-bottom);
        }
        @media (min-width: 768px) {
          .bottom-nav { display: none; }
        }

        .bottom-nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          color: #9E9087;
          text-decoration: none;
          font-size: 10px;
          font-weight: 400;
          padding: 4px 12px;
          transition: color 0.15s;
        }
        .bottom-nav-item.active {
          color: #2C2820;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}
