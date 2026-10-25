import { memo } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import type { Change, ChangeType, Entry, Equipment } from "../state/types";
import { stamp } from "../lib/format";
import { workSummary, workStatusKey, Icon } from "./common";
export const changeLabels: Record<ChangeType, string> = { NEW_ENTRY: "changeNew", CLOSED_ENTRY: "changeClosed", PROGRESS: "changeProgress", EQUIPMENT: "changeEquipment", WORK_DETAILS: "changeWork" };
export function changeText(item: Change, t: ReturnType<typeof useT>) {
  if (item.type === "WORK_DETAILS") return workSummary(item.workDetails || {}, t);
  if (item.type !== "EQUIPMENT") return item.body || t("changeNoNote");
  const status = item.fromStatus === item.toStatus ? t("changeEquipmentNote") : t("changeStatus", { from: t(item.fromStatus || ""), to: t(item.toStatus || "") });
  return status + (item.body ? " · " + item.body : "");
}
export const EquipmentCard = memo(function EquipmentCard({ item, editable = false }: { item: Equipment; editable?: boolean }) {
  const t = useT(), language = useApp(state => state.language);
  return <article className="equipment-card" data-status={item.status} title={item.updatedAt ? stamp(item.updatedAt, language) : t("neverUpdated")}>
    <div className="section-title"><h3>{item.code}</h3><span className={"unit-status unit-" + item.status.toLowerCase()}>{t(item.status)}</span></div>
    <p className="equipment-note">{item.note || "—"}</p>
    {editable && <><p className="hint">{item.updatedAt ? stamp(item.updatedAt, language) + (item.updatedBy ? " · " + item.updatedBy.name : "") : t("neverUpdated")}</p><button type="button" className="button secondary small" onClick={() => app.openEquipment(item)}>{t("update")}</button></>}
  </article>;
});
const ObservationCard = memo(function ObservationCard({ item, recent }: { item: Entry; recent: boolean }) {
  const t = useT(), language = useApp(state => state.language);
  return <button type="button" data-entry-id={item.id} className={"observation-card" + (item.priority === "HIGH" ? " important" : "")} onClick={() => app.patch({ observation: { type: "entry", item } })}>
    <span className="entry-meta"><span className="status">{item.equipmentCode || t("general")}</span><span className={"entry-kind kind-" + item.kind}>{t(item.kind)}</span>{!recent && <span className={"status work-status work-" + (item.closedAt ? "CLOSED" : item.workStatus || "OPEN")}>{t(workStatusKey(item))}</span>}{item.priority === "HIGH" && <span className="priority-high">{t("HIGH")}</span>}</span>
    <strong>{item.title}</strong><span className="observation-excerpt">{item.description || t("detailsInHandover")}</span>
    {(item.responsibleTeam || item.nextStep) && <span className="observation-excerpt work-preview">{workSummary(item, t)}</span>}
    {item.updates?.[0] && <span className="latest-update">{t("latestUpdate", { text: item.updates[0].body })}</span>}
    {item.createdAt && <span className="hint">{t(recent ? "recentOn" : "openedOn", { date: stamp(item.createdAt, language) })}</span>}
  </button>;
});
export const Changes = memo(function Changes() {
  const t = useT(), language = useApp(state => state.language), changes = useApp(state => state.summary?.changes);
  return <section className="panel overview-panel shift-changes" aria-labelledby="changes-title">
    <div className="section-title"><div><h2 id="changes-title">{t("changesTitle")}</h2><p id="changes-window" className="muted">{changes ? t("changesWindow", { date: changes.shiftDate, start: changes.scheduledStart, end: changes.scheduledEnd }) : ""}</p></div></div>
    <p className="hint">{t("changesHint")}</p>
    <dl id="changes-counts" className="changes-counts">{changes && (Object.entries(changeLabels) as Array<[ChangeType, string]>).map(([type, key]) => <div key={type} data-change-type={type}><dt>{t(key)}</dt><dd>{changes.counts[type] || 0}</dd></div>)}</dl>
    <ol id="changes-list" className="changes-list">{changes?.items.length ? changes.items.map(item => <li key={item.type + ":" + item.id}><button type="button" className="observation-card change-card" data-change-type={item.type} data-change-id={item.id} onClick={() => app.patch({ observation: { type: "change", item } })}>
      <span className="entry-meta"><span className="change-label">{t(changeLabels[item.type])}</span>{item.type !== "EQUIPMENT" && <span className="status">{item.equipmentCode || t("general")}</span>}</span>
      <strong>{item.title}</strong><span className="observation-excerpt">{changeText(item, t)}</span><span className="hint">{item.actorName || t("unspecified")} · {stamp(item.createdAt, language)}</span>
    </button></li>) : <li className="overview-empty">{t(changes ? "changesEmpty" : "changesUnavailable")}</li>}</ol>
    <p id="changes-preview" className="hint">{changes && changes.total > changes.items.length ? t("changesPreview", { shown: changes.items.length, total: changes.total }) : ""}</p>
  </section>;
});
export function Overview() {
  const t = useT(), language = useApp(state => state.language), summary = useApp(state => state.summary), current = useApp(state => state.current);
  const checked = useApp(state => state.checkedAt), stale = useApp(state => state.summaryStale || state.currentStale), busy = useApp(state => state.operationsBusy);
  return <>
    <div className="overview-topline"><p className={"hint" + (stale ? " error" : "")} id="overview-updated" role="status">{t(stale ? "overviewStale" : checked ? "overviewUpdated" : "summaryLoading", { date: stamp(checked, language) })}</p><button type="button" id="overview-refresh" className="button quiet small" disabled={busy} onClick={() => { void app.refreshVisible(); }}><Icon name="refresh" size={15} />{t("refresh")}</button></div>
    <div className="plant-snapshot"><section className="overview-shift panel"><div><p className="eyebrow">{t("currentShift")}</p><h2 id="overview-shift-status">{t(current === undefined ? "checking" : current ? "active" : "inactive")}</h2><p id="overview-shift-hours" className="muted">{current ? (current.shiftDate || "") + " · " + current.scheduledStart + "–" + current.scheduledEnd : t(current === undefined ? "checkHint" : "overviewNoShift")}</p></div><a href="#handover" className="text-button">{t("manageShift")}</a></section>
      <section className="snapshot-equipment" aria-labelledby="overview-equipment-title"><div className="section-title"><h2 id="overview-equipment-title">{t("equipment")}</h2><a href="#handover" className="text-button">{t("manageEquipment")}</a></div><div id="overview-equipment" className="equipment-grid">{summary?.equipment.map(item => <EquipmentCard key={item.code} item={item} />)}</div></section>
    </div>
    <div id="overview-counts" className="overview-counts" aria-label={t("openRecords")}>{([["summaryOpen", "total"], ["summaryImportant", "important"], ["overviewTasks", "TASK"], ["overviewAttention", "ATTENTION"]] as const).map(([key, category]) => <div key={category} className="overview-count" data-category={category}><strong>{summary ? summary.counts[category] : "—"}</strong><span>{t(key)}</span></div>)}</div>
    <section className="panel overview-panel" aria-labelledby="overview-open-title"><div className="section-title"><div><h2 id="overview-open-title">{t("overviewOpenTitle")}</h2><p className="muted">{t("overviewOpenHint")}</p></div><a href="#board-title" className="text-button">{t("seeAll")}</a></div>
      <div id="overview-important" className="overview-list">{!summary ? <p className="hint">{t("summaryLoading")}</p> : summary.openItems?.length ? summary.openItems.map(item => <ObservationCard key={item.id} item={item} recent={false} />) : <p className="overview-empty">{t("noOpen")}</p>}
        {summary && summary.counts.total > (summary.openItems?.length || 0) && <p className="hint preview-count">{t("overviewPreview", { shown: summary.openItems?.length || 0, total: summary.counts.total })}</p>}
      </div>
    </section>
    <Changes />
    <section className="panel overview-panel"><div className="section-title"><h2>{t("summaryRecent")}</h2><a href="#history" className="text-button">{t("seeAll")}</a></div><div id="overview-recent" className="overview-list">{!summary ? <p className="hint">{t("summaryLoading")}</p> : summary.recent.length ? summary.recent.map(item => <ObservationCard key={item.id} item={item} recent />) : <p className="overview-empty">{t("noEntries")}</p>}</div></section>
  </>;
}
