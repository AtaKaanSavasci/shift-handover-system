import { memo, useRef } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import type { Entry } from "../state/types";
import { boardKinds, stamp } from "../lib/format";
import { Field, Pagination, workStatusKey } from "./common";
import { EquipmentCard } from "./Overview";
export const UnitOptions = ({ all = true }: { all?: boolean }) => {
  const t = useT();
  return <>{all && <option value="">{t("allUnits")}</option>}<option value="GENERAL">{t("general")}</option>{["GT1", "GT2", "ST"].map(code => <option key={code} value={code}>{code}</option>)}</>;
};
export const EntryCard = memo(function EntryCard({ item }: { item: Entry }) {
  const t = useT(), language = useApp(state => state.language), trackable = boardKinds.includes(item.kind);
  return <article className={"entry-card" + (item.priority === "HIGH" ? " important" : "")}>
    <div className="entry-meta"><span className={"entry-kind kind-" + item.kind}>{t(item.kind)}</span><span className="status">{item.equipmentCode || t("general")}</span>{item.priority === "HIGH" && <span className="priority-high">{t("HIGH")}</span>}
      {trackable ? <span className={"status work-status work-" + (item.closedAt ? "CLOSED" : item.workStatus || "OPEN")}>{t(workStatusKey(item))}</span> : item.closedAt && <span className="status">{t("closed")}</span>}
    </div><h3>{item.title}</h3><p className="entry-description">{item.description}</p><p className="hint">{item.author?.name || "—"} · {stamp(item.createdAt, language)}{item.shiftId ? " · #" + item.shiftId : ""}</p>
    {trackable && item.responsibleTeam && <p className="work-team">{t("workTeamValue", { team: item.responsibleTeam })}</p>}
    {trackable && item.nextStep && <p className="work-next">{t("workNextValue", { step: item.nextStep })}</p>}
    {trackable && item.updates?.[0] && <><p className="latest-update">{t("latestUpdate", { text: item.updates[0].body })}</p><p className="hint">{item.updates[0].author.name} · {stamp(item.updates[0].createdAt, language)}</p></>}
    {item.closedAt && <><p className="hint">{t("closedBy", { name: item.closedBy?.name || "—", date: stamp(item.closedAt, language) })}</p>{item.closeNote && <p className="close-note">{item.closeNote}</p>}</>}
    <div className="entry-actions">
      {trackable && <><button type="button" className="button quiet small" data-work-for={item.id} onClick={() => { void app.work.open(item); }}>{t("workDetails")}</button><button type="button" className="button quiet small" data-updates-for={item.id} onClick={() => { void app.notes.open(item); }}>{t("updates", { count: item._count?.updates || 0 })}</button></>}
      {item.photos?.map((photo, index) => <button key={photo.id} type="button" className="button quiet small" onClick={() => { void app.viewPhoto(photo.id); }}>{t("viewPhoto", { number: index + 1 })}</button>)}
      {trackable && !item.closedAt && <button type="button" className="button secondary small" onClick={() => app.openClose(item)}>{t("closeItem")}</button>}
    </div>
  </article>;
});
function ShiftCard() {
  const t = useT(), current = useApp(state => state.current), schedule = useApp(state => state.schedule), busy = useApp(state => state.shiftBusy), form = useRef<HTMLFormElement>(null);
  const active = Boolean(current), known = current !== undefined;
  const slots = ["00:00-08:00", "08:00-16:00", "16:00-00:00"];
  return <section className="shift-card" aria-labelledby="shift-title"><div className="shift-main"><div className="shift-heading"><span className="eyebrow">{t("currentShift")}</span><span id="shift-badge" className={"live-badge" + (active ? " active" : "")}>{t(!known ? "loading" : active ? "active" : "inactive")}</span></div>
    <h2 id="shift-title">{t(!known ? "checking" : active ? "shiftActiveTitle" : "shiftReady")}</h2><p id="shift-description">{t(!known ? "checkHint" : active ? "shiftActiveHint" : "shiftReadyHint")}</p>
    <form id="shift-schedule" ref={form} className="shift-schedule" onSubmit={event => event.preventDefault()}>
      <div><Field id="shift-date" label={t("shiftDate")} type="date" value={schedule.date} onValue={date => app.patch({ schedule: { ...schedule, date } })} required disabled={active} /></div>
      <div><Field id="shift-slot" label={t("shiftHours")} control="select" value={schedule.slot} onValue={slot => app.patch({ schedule: { ...schedule, slot } })} disabled={active}>{!slots.includes(schedule.slot) && <option value={schedule.slot}>{schedule.slot || t("unspecified")}</option>}{slots.map(slot => <option key={slot} value={slot}>{slot.replace("-", "–")}</option>)}</Field></div>
    </form><p className="overnight-note">{t("overnight")}</p></div>
    <div className="shift-action"><button type="button" id="shift-button" className="button accent" disabled={busy} onClick={() => { if (known && !active && !form.current?.reportValidity()) return; void app.toggleShift(); }}>{t(busy ? "processing" : !known ? "checkStatus" : active ? "endShift" : "startShift")}</button><span>{t("recordedAutomatically")}</span></div>
  </section>;
}
function HandoverSummary() {
  const t = useT(), language = useApp(state => state.language), summary = useApp(state => state.summary), busy = useApp(state => state.summaryBusy);
  const read = Boolean(summary?.receipt?.revision === summary?.revision);
  const stats = [["summaryOpen", summary?.counts.total], ["summaryImportant", summary?.counts.important], ["summaryValves", summary?.counts.VALVE], ["summaryTasks", summary?.counts.TASK]] as const;
  return <section className="panel handover-summary" aria-labelledby="summary-title"><div className="section-title"><div><h2 id="summary-title">{t("summary")}</h2><p className="muted">{t("summaryHint")}</p></div><a className="text-button" href="#board-title">{t("viewBoard")}</a></div>
    <div id="summary-units" className="summary-units">{summary?.equipment.map(item => <span key={item.code} className={"unit-status unit-" + item.status.toLowerCase()}>{item.code} · {t(item.status)}</span>)}</div>
    <div id="summary-counts" className="summary-counts">{summary && stats.map(([key, count]) => <div key={key} className="summary-stat"><strong>{count}</strong><span>{t(key)}</span></div>)}</div>
    <div className="summary-lists"><div><h3>{t("summaryImportant")}</h3><ul id="summary-important">{summary && (summary.important.length ? summary.important.map(item => <li key={item.id}>{item.equipmentCode || t("general")} · {item.title}</li>) : <li>{t("noImportant")}</li>)}</ul></div><div><h3>{t("summaryRecent")}</h3><ul id="summary-recent">{summary && (summary.recent.length ? summary.recent.map(item => <li key={item.id}>{t(item.kind)} · {item.title}</li>) : <li>{t("noEntries")}</li>)}</ul></div></div>
    <p id="summary-read-status" className="hint" aria-live="polite">{!summary ? t("summaryLoading") : !summary.activeShiftId ? t("summaryStart") : read ? t("summaryReadDone", { date: stamp(summary.receipt?.readAt, language) }) : summary.receipt ? t("summaryChanged") : ""}</p>
    <button id="summary-read" type="button" className="button primary" disabled={busy || !summary?.activeShiftId || read} onClick={() => { void app.acknowledge(); }}>{t(busy ? "processing" : "summaryRead")}</button>
  </section>;
}
function Board() {
  const t = useT(), board = useApp(state => state.board), filters = useApp(state => state.boardFilterDraft), applied = useApp(state => state.boardFilters), busy = useApp(state => state.operationsBusy);
  const signedIn = useApp(state => Boolean(state.user));
  return <section className="panel" aria-labelledby="board-title"><div className="section-title"><div><h2 id="board-title">{t("board")}</h2><p className="muted">{t("boardHint")}</p></div><span id="board-count" className="count">{board.total}</span></div>
    <form id="board-filter" className="board-filter" onSubmit={event => { event.preventDefault(); void app.applyBoard(); }}>
      <div><Field id="board-kind" name="kind" label={t("kind")} control="select" value={filters.kind} onValue={kind => app.patch({ boardFilterDraft: { ...filters, kind } })}><option value="">{t("allKinds")}</option>{["TASK", "VALVE", "ATTENTION"].map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}</Field></div>
      <div><Field id="board-unit" name="equipment" label={t("unit")} control="select" value={filters.equipment} onValue={equipment => app.patch({ boardFilterDraft: { ...filters, equipment } })}><UnitOptions /></Field></div>
      <div><Field id="board-priority" name="priority" label={t("priority")} control="select" value={filters.priority} onValue={priority => app.patch({ boardFilterDraft: { ...filters, priority } })}><option value="">{t("allPriorities")}</option><option value="HIGH">{t("HIGH")}</option></Field></div>
      <div className="filter-actions"><button id="board-apply" type="submit" className="button secondary" disabled={busy}>{t("apply")}</button><button id="board-clear" type="button" className="text-button" disabled={busy} onClick={() => { void app.clearBoard(); }}>{t("clear")}</button></div>
    </form>
    <div id="board-entries" className="entries-list" aria-busy={busy}>{signedIn && (board.items.length ? board.items.map(item => <EntryCard key={item.id} item={item} />) : <p className="empty-state">{t(applied ? "noOperationResults" : "noOpen")}</p>)}</div>
    <Pagination prefix="board" page={board.page} total={board.total} busy={busy} previous={() => { void app.loadOperations({ scope: "board", boardPage: board.page - 1 }); }} next={() => { void app.loadOperations({ scope: "board", boardPage: board.page + 1 }); }} />
  </section>;
}
export function Handover() {
  const t = useT(), equipment = useApp(state => state.summary?.equipment), busy = useApp(state => state.operationsBusy);
  return <><ShiftCard /><HandoverSummary /><section className="equipment-section" aria-labelledby="equipment-title"><div className="section-title"><div><h2 id="equipment-title">{t("equipment")}</h2><p className="muted" data-i18n="equipmentHint">{t("equipmentHint")}</p></div><button type="button" id="refresh-operations" className="button quiet" disabled={busy} onClick={() => { void app.loadOperations(); }}>{t("refresh")}</button></div><div id="equipment-grid" className="equipment-grid">{equipment?.map(item => <EquipmentCard key={item.code} item={item} editable />)}</div></section><Board /></>;
}
