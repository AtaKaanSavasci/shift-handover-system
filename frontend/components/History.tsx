import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { localDate, stamp } from "../lib/format";
import { Field, Pagination } from "./common";
import { EntryCard, UnitOptions } from "./Handover";
function OperationsHistory() {
  const t = useT(), data = useApp(state => state.operations), filters = useApp(state => state.operationFilterDraft), applied = useApp(state => state.operationFilters), busy = useApp(state => state.operationsBusy);
  const signedIn = useApp(state => Boolean(state.user));
  const change = (key: string, value: string) => app.patch({ operationFilterDraft: { ...filters, [key]: value } });
  return <section className="panel operation-history"><div className="section-title"><h2>{t("operationHistory")}</h2><span id="operation-count" className="count">{data.total}</span></div>
    <form id="operations-filter" className="operations-filter" onSubmit={event => { event.preventDefault(); void app.applyOperations(); }}>
      <div className="search-field"><Field id="operations-q" name="q" label={t("searchText")} type="search" maxLength={160} value={filters.q || ""} onValue={value => change("q", value)} /></div>
      <div><Field id="operations-unit" name="equipment" label={t("unit")} control="select" value={filters.equipment || ""} onValue={value => change("equipment", value)}><UnitOptions /></Field></div>
      <div><Field id="operations-kind" name="kind" label={t("kind")} control="select" value={filters.kind || ""} onValue={value => change("kind", value)}><option value="">{t("allKinds")}</option>{["EVENT", "NOTE", "VALVE", "ATTENTION", "TASK"].map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}</Field></div>
      <div><Field id="operations-status" name="status" label={t("status")} control="select" value={filters.status || ""} onValue={value => change("status", value)}><option value="">{t("allStatuses")}</option><option value="open">{t("open")}</option><option value="closed">{t("closed")}</option></Field></div>
      <div><Field id="operations-from" name="from" label={t("from")} type="date" value={filters.from || ""} onValue={value => change("from", value)} /></div>
      <div><Field id="operations-to" name="to" label={t("to")} type="date" value={filters.to || ""} onValue={value => change("to", value)} /></div>
      <div className="filter-actions"><button type="submit" className="button secondary" disabled={busy}>{t("searchRecords")}</button><button type="button" id="operations-clear" className="text-button" disabled={busy} onClick={() => { void app.clearOperations(); }}>{t("clear")}</button></div>
    </form><p className="hint search-hint">{t("searchHint")}</p>
    <div id="operation-entries" className="entries-list">{signedIn && (data.items.length ? data.items.map(item => <EntryCard key={item.id} item={item} />) : <p className="empty-state">{t(applied ? "noOperationResults" : "noEntries")}</p>)}</div>
    <Pagination prefix="operation" page={data.page} total={data.total} busy={busy} previous={() => { void app.loadOperations({ scope: "history", historyPage: data.page - 1 }); }} next={() => { void app.loadOperations({ scope: "history", historyPage: data.page + 1 }); }} />
  </section>;
}
function ShiftHistory() {
  const t = useT(), language = useApp(state => state.language), user = useApp(state => state.user);
  const data = useApp(state => state.shifts), draft = useApp(state => state.shiftFilterDraft), applied = useApp(state => state.shiftFilters);
  const busy = useApp(state => state.shiftsLoading), failed = useApp(state => state.shiftsFailed), exporting = useApp(state => state.exporting);
  const params = new URLSearchParams(applied), filtered = params.has("from") || params.has("to"), all = params.get("scope") === "all";
  return <section className="history-card" aria-labelledby="history-title"><div className="history-heading"><div><div className="title-row"><h2 id="history-title">{t("shiftHistory")}</h2><span className="count" id="record-count">{data.total}</span></div><p className="muted">{t("historyHint")}</p></div><button id="export-button" type="button" className="button outline" disabled={busy || exporting || app.shiftParams() !== applied} onClick={() => { void app.exportShifts(); }}><span id="export-label">{t(exporting ? "processing" : "export")}</span></button></div>
    <form id="filter-form" className="filters" onSubmit={event => { event.preventDefault(); void app.applyShifts(); }}>
      <div><Field id="from" name="from" label={t("from")} type="date" value={draft.from} onValue={from => app.changeShiftFilters({ from })} /></div><div><Field id="to" name="to" label={t("to")} type="date" value={draft.to} onValue={to => app.changeShiftFilters({ to })} /></div>
      <div id="scope-field" hidden={user?.role !== "MANAGER"}><Field id="scope" label={t("records")} control="select" value={draft.scope} onValue={scope => app.changeShiftFilters({ scope })}><option value="own">{t("own")}</option><option value="all">{t("all")}</option></Field></div>
      <div className="filter-actions"><button className="button secondary" id="filter-button" type="submit" disabled={busy}>{t("apply")}</button><button type="button" id="clear-filters" className="text-button" hidden={!applied} onClick={() => { void app.clearShifts(); }}>{t("clear")}</button></div>
    </form>
    <p className="filter-note" id="filter-note">{filtered ? t("filterNote", { from: params.get("from") || t("firstRecord"), to: params.get("to") || t("lastRecord") }) : t("allDates")}</p>
    <p className="scroll-hint">{t("scroll")}</p><div id="table-loading" className="empty-state" hidden={!busy}>{t("loading")}</div>
    <div id="empty-state" className="empty-state" hidden={busy || Boolean(data.items.length)}><h3 id="empty-title">{t(filtered ? "noResults" : "noShift")}</h3><p id="empty-description">{t(filtered ? "noResultsHint" : "noShiftHint")}</p></div>
    <div className="table-wrap" id="table-wrap" hidden={busy || !data.items.length}><table><thead><tr><th scope="col">{t("shift")}</th><th scope="col" id="person-heading" hidden={!all}>{t("staff")}</th><th scope="col">{t("shiftDate")}</th><th scope="col">{t("shiftHours")}</th><th scope="col">{t("actualStart")}</th><th scope="col">{t("actualEnd")}</th><th scope="col">{t("status")}</th></tr></thead><tbody id="shift-rows">{data.items.map(item => <tr key={item.id}><td>#{item.id}</td>{all && <td>{item.user?.name}</td>}<td>{item.shiftDate || localDate(item.startTime)}</td><td>{item.scheduledStart && item.scheduledEnd ? item.scheduledStart + "–" + item.scheduledEnd : t("unspecified")}</td><td>{stamp(item.startTime, language)}</td><td>{stamp(item.endTime, language)}</td><td><span className={"status" + (item.status === "ACTIVE" ? " active" : "")}>{t(item.status === "ACTIVE" ? "inProgress" : "completed")}</span></td></tr>)}</tbody></table></div>
    <div className="table-footer"><span id="page-label">{failed ? t("historyFailed") : data.total ? t("pageLabel", { from: (data.page - 1) * 20 + 1, to: Math.min(data.page * 20, data.total), total: data.total }) : t("zero")}</span><div className="pagination"><button id="previous" type="button" className="button small quiet" disabled={busy || data.page <= 1} onClick={() => { void app.loadShifts(data.page - 1); }}>{t("previous")}</button><button id="next" type="button" className="button small quiet" disabled={busy || data.page * 20 >= data.total} onClick={() => { void app.loadShifts(data.page + 1); }}>{t("next")}</button></div></div>
  </section>;
}
export function History() { return <><OperationsHistory /><ShiftHistory /></>; }
