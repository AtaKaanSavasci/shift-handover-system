import { useEffect, useRef } from "react";
import { app } from "./state/store";
import { useApp, useApplicationEffects, useMobileViewport, useT } from "./state/hooks";
import { locale } from "./lib/format";
import { AuthView } from "./components/AuthView";
import { Overview } from "./components/Overview";
import { EntryForm } from "./components/EntryForm";
import { Handover } from "./components/Handover";
import { History } from "./components/History";
import { Dialogs } from "./components/Dialogs";
import { AiChat } from "./components/AiChat";
import { Brand, Preferences, Icon, MessageLine } from "./components/common";
const pages = { overview: ["navOverview", "overviewHint", "overview"], "new-record": ["navNew", "newRecordHint", "plus"], handover: ["navHandover", "handoverPageHint", "handover"], history: ["navHistory", "historyPageHint", "history"] } as const;
function ConnectionStatus() {
  const t = useT(), language = useApp(state => state.language), connection = useApp(state => state.connection);
  const status = !connection.browserOnline || connection.reachable === false ? "offline" : connection.failures.length ? "warning" : connection.reachable ? "online" : "checking";
  return <div id="connection-status" className="connection-status" data-state={status}><div role="status" aria-live="polite"><span id="connection-label">{t("connection" + status)}</span><small id="connection-time">{connection.lastResponse ? t("connectionLastResponse", { time: new Intl.DateTimeFormat(locale(language), { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(connection.lastResponse)) }) : ""}</small></div><button id="connection-retry" type="button" className="button quiet small" hidden={status === "online"} disabled={connection.busy || !connection.browserOnline} onClick={() => { void app.retryConnection(); }}>{t(connection.busy ? "processing" : "connectionRetry")}</button></div>;
}
function Dashboard() {
  const t = useT(), language = useApp(state => state.language), user = useApp(state => state.user), page = useApp(state => state.page);
  const navigation = useApp(state => state.navigationVersion), message = useApp(state => state.dashboardMessage), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.title = user ? t(pages[page][0]) + " · " + t("brand") : t("brand"); }, [user, page, t]);
  useEffect(() => { if (user && navigation) { heading.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); if (location.hash === "#board-title") document.getElementById("board-title")?.scrollIntoView(); } }, [navigation, user]);
  return <div id="dashboard" hidden={!user}><header className="topbar"><div className="topbar-inner"><Brand /><div className="account-area"><Preferences /><span className="avatar" id="avatar" aria-hidden="true">{user?.name.trim().split(/\s+/).slice(0, 2).map(name => name[0]).join("").toLocaleUpperCase(locale(language))}</span><div className="account-details"><strong id="account-name">{user?.name || ""}</strong><small id="account-role">{user ? t(user.role) : ""}</small></div><button type="button" id="logout" className="button quiet" onClick={app.requestLogout}>{t("logout")}</button></div></div></header>
    <nav className="workspace-nav" aria-label={t("brand")}>{(Object.entries(pages) as Array<[keyof typeof pages, typeof pages[keyof typeof pages]]>).map(([key, [label, , icon]]) => <a key={key} href={"#" + key} data-nav={key} aria-current={page === key ? "page" : undefined}><Icon name={icon} /><span>{t(label)}</span></a>)}</nav>
    <main className="workspace"><ConnectionStatus /><div className="welcome"><div><p className="eyebrow" id="greeting">{user ? t("greeting", { name: user.name.trim().split(/\s+/)[0] || user.name }) : ""}</p><h1 id="page-title" tabIndex={-1} ref={heading}>{t(pages[page][0])}</h1><p className="muted" id="page-description">{t(pages[page][1])}</p></div><div className="today"><span className="date-dot" aria-hidden="true" /><span id="today">{new Intl.DateTimeFormat(locale(language), { timeZone: "Europe/Istanbul", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span></div></div>
      <MessageLine id="dashboard-message" className="dashboard-message" message={message} />
      <div id="page-overview" data-page="overview" hidden={page !== "overview"}><Overview /></div>
      <div id="page-new-record" data-page="new-record" hidden={page !== "new-record"}><EntryForm /></div>
      <div id="page-handover" data-page="handover" hidden={page !== "handover"}><Handover /></div>
      <div id="page-history" data-page="history" hidden={page !== "history"}><History /></div>
      <footer className="workspace-footer"><span>{t("brand")}</span><span>{t("exportLimit")}</span></footer>
    </main><AiChat />
  </div>;
}
export function App() { useApplicationEffects(); useMobileViewport(); return <><AuthView /><Dashboard /><Dialogs /></>; }
