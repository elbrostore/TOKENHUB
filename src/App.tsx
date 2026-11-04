import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  Bell, History, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, Wallet, X, Zap, ArrowUpRight, Banknote,
} from "lucide-react";
import { AuthProvider } from "./auth/AuthProvider";
import { useAuth } from "./auth/useAuth";
import { fetchDashboard } from "./lib/api";
import { routeFromHash } from "./routes";
import type { Route } from "./routes";
import { AuthScreen } from "./pages/AuthScreen";
import { ResetPassword } from "./pages/ResetPassword";
import { Dashboard } from "./pages/Dashboard";
import { Earn } from "./pages/Earn";
import { WalletPage } from "./pages/Wallet";
import { Transactions } from "./pages/Transactions";
import { Referrals } from "./pages/Referrals";
import { Withdrawals } from "./pages/Withdrawals";
import { Notifications } from "./pages/Notifications";
import { SettingsPage } from "./pages/Settings";
const Admin = lazy(() => import("./pages/admin/Admin").then((m) => ({ default: m.Admin })));

const MENU: { key: Route; name: string; icon: typeof Wallet }[] = [
  { key: "dashboard", name: "Dashboard", icon: LayoutDashboard },
  { key: "earn", name: "Earn Tokens", icon: Zap },
  { key: "wallet", name: "My Wallet", icon: Wallet },
  { key: "transactions", name: "Transactions", icon: History },
  { key: "referrals", name: "Referrals", icon: Users },
  { key: "withdrawals", name: "Withdrawals", icon: Banknote },
  { key: "notifications", name: "Notifications", icon: Bell },
  { key: "settings", name: "Settings", icon: Settings },
];

function Shell() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const go = useCallback((next: Route) => {
    window.location.hash = `/${next}`;
    setMobileOpen(false);
  }, []);

  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshUnread = useCallback(() => {
    fetchDashboard().then((d) => setUnread(Number(d.unread_notifications))).catch(() => undefined);
  }, []);
  useEffect(() => { refreshUnread(); }, [route, refreshUnread]);

  const items = isAdmin ? [...MENU, { key: "admin" as Route, name: "Admin", icon: ShieldCheck }] : MENU;
  const current = items.find((i) => i.key === route) ?? MENU[0];
  const displayName = profile?.username || profile?.full_name || user?.email?.split("@")[0] || "Member";

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">T</div>
          <div><div className="brand-name">TOKEN<span>HUB</span></div><div className="brand-caption">REWARDS PLATFORM</div></div>
          <button className="close-menu" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="nav-label">MENU</div>
        <nav className="navigation" aria-label="Main">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={`nav-item ${route === item.key ? "active" : ""}`} aria-current={route === item.key ? "page" : undefined} onClick={() => go(item.key)}>
                <Icon size={19} /><span>{item.name}</span>
                {item.key === "notifications" && unread > 0 && <span className="notification-dot" aria-label={`${unread} unread`} />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon"><ShieldCheck size={20} /></div>
            <strong>Your account matters</strong>
            <p>Keep your account secure and your information private.</p>
            <button onClick={() => go("settings")}>Security settings <ArrowUpRight size={14} /></button>
          </div>
          <button className="nav-item logout" onClick={signOut}><LogOut size={19} /><span>Sign out</span></button>
          <div className="version">TOKENHUB · VERSION 1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
            <div>
              <div className="breadcrumb">WORKSPACE <span>/</span> {current.name.toUpperCase()}</div>
              <h1>{current.name}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="notification-button" onClick={() => go("notifications")} aria-label="Notifications"><Bell size={19} />{unread > 0 && <i />}</button>
            <div className="profile">
              <div className="avatar">{displayName.charAt(0).toUpperCase()}</div>
              <div className="profile-info"><strong>{displayName}</strong><span>{user?.email}</span></div>
            </div>
          </div>
        </header>
        <div className="page-content">
          {route === "dashboard" && <Dashboard go={go} />}
          {route === "earn" && <Earn />}
          {route === "wallet" && <WalletPage go={go} />}
          {route === "transactions" && <Transactions />}
          {route === "referrals" && <Referrals />}
          {route === "withdrawals" && <Withdrawals />}
          {route === "notifications" && <Notifications onChanged={refreshUnread} />}
          {route === "settings" && <SettingsPage />}
          {route === "admin" && <Suspense fallback={<div className="state-box" role="status">Loading...</div>}><Admin /></Suspense>}
          <footer className="footer">
            <div className="footer-brand">TOKEN<span>HUB</span></div>
            <span>© 2026 TOKENHUB. All rights reserved.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function Gate() {
  const { user, loading, passwordRecovery } = useAuth();
  if (loading) return <div className="auth-loading" role="status">Loading TOKENHUB...</div>;
  if (passwordRecovery) return <ResetPassword />;
  if (!user) return <AuthScreen />;
  return <Shell />;
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>;
}
