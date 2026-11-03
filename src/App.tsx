
import { useState } from "react";
import {
  LayoutDashboard, Zap, Wallet, History, Users, Bell, Settings,
  LogOut, Search, Menu, X, ArrowUpRight,
  Gift, Target, TrendingUp, ShieldCheck, ChevronRight,
  CircleDollarSign, Clock3, CheckCircle2, LockKeyhole
} from "lucide-react";
import "./index.css";

const menu = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Earn Tokens", icon: Zap },
  { name: "My Wallet", icon: Wallet },
  { name: "Transactions", icon: History },
  { name: "Referrals", icon: Users },
  { name: "Notifications", icon: Bell },
  { name: "Settings", icon: Settings },
];

const tasks = [
  { title: "Complete a survey", desc: "Share your opinion and earn tokens.", reward: 250, type: "Survey", icon: Target },
  { title: "Discover new offers", desc: "Explore available partner offers.", reward: 500, type: "Offerwall", icon: Gift },
  { title: "Watch a rewarded video", desc: "Watch an eligible rewarded advertisement.", reward: 50, type: "Rewarded Ad", icon: Zap },
];

const transactions = [
  { title: "Welcome to TOKENHUB", date: "Just now", amount: "+100", status: "Demo", icon: Gift },
  { title: "Survey reward", date: "Example transaction", amount: "+250", status: "Demo", icon: CheckCircle2 },
  { title: "Withdrawal request", date: "Example transaction", amount: "-500", status: "Demo", icon: ArrowUpRight },
];

function App() {
  const [active, setActive] = useState("Dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const selectPage = (name: string) => {
    setActive(name);
    setMobileOpen(false);
    if (name !== "Dashboard") {
      setNotice(`${name} module will be connected in the next development stage.`);
    } else {
      setNotice("");
    }
  };

  return (
    <div className="app-shell">
      {mobileOpen && <button className="mobile-overlay" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol">T</div>
          <div>
            <div className="brand-name">TOKEN<span>HUB</span></div>
            <div className="brand-caption">REWARDS PLATFORM</div>
          </div>
          <button className="close-menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>

        <div className="nav-label">MENU</div>
        <nav className="navigation">
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                className={`nav-item ${active === item.name ? "active" : ""}`}
                onClick={() => selectPage(item.name)}
              >
                <Icon size={19} />
                <span>{item.name}</span>
                {item.name === "Notifications" && <span className="notification-dot" />}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <div className="security-icon"><ShieldCheck size={20} /></div>
            <strong>Your account matters</strong>
            <p>Keep your account secure and your information private.</p>
            <button onClick={() => selectPage("Settings")}>Security settings <ArrowUpRight size={14} /></button>
          </div>
          <button className="nav-item logout" onClick={() => setNotice("Authentication will be enabled when Supabase is connected.")}>
            <LogOut size={19} /><span>Sign out</span>
          </button>
          <div className="version">TOKENHUB · VERSION 1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
            <div>
              <div className="breadcrumb">WORKSPACE <span>/</span> {active.toUpperCase()}</div>
              <h1>{active === "Dashboard" ? "Dashboard" : active}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="search-button" onClick={() => setNotice("Search will be available in a future update.")}><Search size={18} /></button>
            <button className="notification-button" onClick={() => selectPage("Notifications")}><Bell size={19} /><i /></button>
            <div className="profile">
              <div className="avatar">U</div>
              <div className="profile-info"><strong>Guest User</strong><span>Free Member</span></div>
            </div>
          </div>
        </header>

        <div className="page-content">
          {notice && <div className="notice"><LockKeyhole size={17} />{notice}<button onClick={() => setNotice("")}><X size={16} /></button></div>}

          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="live-dot" /> YOUR REWARDS, YOUR PROGRESS</div>
              <h2>Welcome to <span>TOKENHUB.</span></h2>
              <p>Complete activities, collect tokens and track your progress.</p>
            </div>
            <button className="primary-button" onClick={() => selectPage("Earn Tokens")}><Zap size={17} /> Start earning <ArrowUpRight size={16} /></button>
          </section>

          <section className="stats-grid">
            <div className="stat-card balance-card">
              <div className="stat-top"><span>Total balance</span><div className="stat-icon green"><Wallet size={19} /></div></div>
              <div className="stat-number">0 <small>TOKENS</small></div>
              <div className="stat-bottom"><span className="muted">Your available balance</span><span className="demo-tag">DEMO</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>Total earned</span><div className="stat-icon blue"><TrendingUp size={19} /></div></div>
              <div className="stat-number">0 <small>TOKENS</small></div>
              <div className="stat-bottom"><span className="muted">Lifetime earnings</span><span className="stat-neutral">—</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>Completed tasks</span><div className="stat-icon purple"><CheckCircle2 size={19} /></div></div>
              <div className="stat-number">0</div>
              <div className="stat-bottom"><span className="muted">Successfully completed</span><span className="stat-neutral">—</span></div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>Referral rewards</span><div className="stat-icon orange"><Users size={19} /></div></div>
              <div className="stat-number">0 <small>TOKENS</small></div>
              <div className="stat-bottom"><span className="muted">From your referrals</span><span className="stat-neutral">—</span></div>
            </div>
          </section>

          <section className="content-grid">
            <div className="panel earn-panel">
              <div className="panel-heading">
                <div><div className="section-kicker">OPPORTUNITIES</div><h3>Ways to earn</h3><p>Choose an activity to get started.</p></div>
                <button className="text-link" onClick={() => selectPage("Earn Tokens")}>View all <ChevronRight size={16} /></button>
              </div>
              <div className="task-list">
                {tasks.map((task) => {
                  const Icon = task.icon;
                  return (
                    <div className="task-item" key={task.title}>
                      <div className="task-icon"><Icon size={21} /></div>
                      <div className="task-details"><strong>{task.title}</strong><span>{task.desc}</span><small>{task.type}</small></div>
                      <div className="task-action"><strong>+{task.reward}</strong><span>tokens</span><button onClick={() => setNotice("Tasks are examples. Real rewards will only be credited after verified provider confirmation.")}>Explore <ArrowUpRight size={14} /></button></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="panel progress-panel">
              <div className="section-kicker">YOUR ACTIVITY</div>
              <h3>Account overview</h3>
              <p className="panel-description">Your journey starts here.</p>
              <div className="progress-circle"><div><strong>0%</strong><span>COMPLETED</span></div></div>
              <div className="progress-caption"><span>Account progress</span><strong>Getting started</strong></div>
              <div className="progress-track"><span /></div>
              <div className="tip-box"><div className="tip-icon"><CircleDollarSign size={19} /></div><div><strong>Ready to earn?</strong><p>Explore available earning opportunities when they become active.</p></div></div>
            </div>
          </section>

          <section className="panel transactions-panel">
            <div className="panel-heading">
              <div><div className="section-kicker">WALLET HISTORY</div><h3>Recent transactions</h3><p>Keep track of your latest activity.</p></div>
              <button className="text-link" onClick={() => selectPage("Transactions")}>View history <ChevronRight size={16} /></button>
            </div>
            <div className="transaction-table">
              <div className="table-head"><span>DESCRIPTION</span><span>DATE</span><span>AMOUNT</span><span>STATUS</span></div>
              {transactions.map((transaction, index) => {
                const Icon = transaction.icon;
                return (
                  <div className="transaction-row" key={index}>
                    <div className="transaction-name"><div className="transaction-icon"><Icon size={17} /></div><strong>{transaction.title}</strong></div>
                    <span className="transaction-date"><Clock3 size={14} />{transaction.date}</span>
                    <strong className={transaction.amount.startsWith("+") ? "positive" : "negative"}>{transaction.amount} <small>TOK</small></strong>
                    <span className="status-demo">{transaction.status}</span>
                  </div>
                );
              })}
            </div>
            <div className="demo-disclaimer">These are demonstration entries only. No real balance or transactions have been created.</div>
          </section>

          <footer className="footer">
            <div className="footer-brand">TOKEN<span>HUB</span></div>
            <span>© 2026 TOKENHUB. All rights reserved.</span>
            <div className="footer-links"><span>Privacy</span><span>Terms</span><span>Support</span></div>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
