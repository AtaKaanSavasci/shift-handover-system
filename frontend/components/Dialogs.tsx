import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import type { EquipmentStatus, WorkStatus } from "../state/types";
import { boardKinds, stamp } from "../lib/format";
import { Modal, Field, MessageLine, Pagination, workSummary } from "./common";
import { changeLabels, changeText } from "./Overview";
function EquipmentDialog() {
  const t = useT(), dialog = useApp(state => state.equipmentDialog);
  const close = () => { if (!dialog?.busy) app.patch({ equipmentDialog: null }); };
  return <Modal id="equipment-dialog" open={Boolean(dialog)} busy={dialog?.busy} onDismiss={close} labelledBy="equipment-dialog-title"><form id="equipment-form" onSubmit={event => { event.preventDefault(); void app.saveEquipment(); }}>
    <h2 id="equipment-dialog-title">{dialog ? dialog.item.code + " · " + t("update") : ""}</h2>
    <Field id="equipment-status" label={t("status")} control="select" value={dialog?.status || "UNKNOWN"} onValue={status => app.changeEquipment({ status: status as EquipmentStatus })} disabled={dialog?.busy}>{["UNKNOWN", "ACTIVE", "INACTIVE", "MAINTENANCE"].map(value => <option key={value} value={value}>{t(value)}</option>)}</Field>
    <Field id="equipment-note" label={t("equipmentNote")} control="textarea" rows={3} maxLength={1000} value={dialog?.note || ""} onValue={note => app.changeEquipment({ note })} disabled={dialog?.busy} resetKey={dialog?.item.code || ""} />
    <MessageLine id="equipment-message" message={dialog?.message || null} alert className="error" />
    <div className="dialog-actions"><button type="button" className="button quiet" disabled={dialog?.busy} onClick={close}>{t("cancel")}</button><button type="submit" id="equipment-save" className="button primary" disabled={dialog?.busy}>{t("save")}</button></div>
  </form></Modal>;
}
function CloseDialog() {
  const t = useT(), dialog = useApp(state => state.closeDialog);
  const close = () => { if (!dialog?.busy) app.patch({ closeDialog: null }); };
  return <Modal id="close-dialog" open={Boolean(dialog)} busy={dialog?.busy} onDismiss={close}><form id="close-form" onSubmit={event => { event.preventDefault(); void app.saveClose(); }}>
    <h2>{t("closeItem")}</h2><p id="close-title" className="muted">{dialog?.title || ""}</p>
    <Field id="close-note" label={t("closeNote")} control="textarea" rows={3} maxLength={1000} value={dialog?.note || ""} onValue={note => { if (dialog) app.patch({ closeDialog: { ...dialog, note } }); }} disabled={dialog?.busy} resetKey={dialog?.id || 0} />
    <p className="hint">{t("closeHint")}</p><MessageLine id="close-message" message={dialog?.message || null} alert className="error" />
    <div className="dialog-actions"><button type="button" className="button quiet" disabled={dialog?.busy} onClick={close}>{t("cancel")}</button><button type="submit" id="close-save" className="button primary" disabled={dialog?.busy}>{t("closeItem")}</button></div>
  </form></Modal>;
}
function PhotoDialog() {
  const t = useT(), url = useApp(state => state.photoUrl);
  return <Modal id="photo-dialog" open={Boolean(url)} onDismiss={app.closePhoto}><button type="button" className="button quiet" data-close="photo-dialog" onClick={app.closePhoto}>{t("close")}</button><img id="entry-photo" src={url || undefined} alt={url ? t("photo") : ""} /></Modal>;
}
function ObservationDialog() {
  const t = useT(), language = useApp(state => state.language), observation = useApp(state => state.observation);
  const close = () => app.patch({ observation: null });
  const item = observation?.item, entry = observation?.type === "entry" ? observation.item : null, change = observation?.type === "change" ? observation.item : null;
  const linked = entry && boardKinds.includes(entry.kind) ? { id: entry.id, title: entry.title } : change?.entryId ? { id: change.entryId, title: change.title } : null;
  const history = entry ? ["EVENT", "NOTE"].includes(entry.kind) : change?.type === "CLOSED_ENTRY";
  const meta = entry ? (entry.equipmentCode || t("general")) + " · " + t(entry.kind) + " · " + stamp(entry.createdAt, language)
    : change ? t(changeLabels[change.type]) + " · " + (change.actorName || t("unspecified")) + " · " + stamp(change.createdAt, language) : "";
  return <Modal id="overview-dialog" open={Boolean(observation)} onDismiss={close} labelledBy="overview-detail-title"><div className="section-title"><h2 id="overview-detail-title">{item?.title || ""}</h2><button type="button" className="button quiet small" onClick={close}>{t("close")}</button></div>
    <p id="overview-detail-meta" className="hint">{meta}</p><p id="overview-detail-description" className="entry-description">{entry ? entry.description || t("detailsInHandover") : change ? changeText(change, t) : ""}</p>
    <p id="overview-detail-work-summary" className="work-next">{entry && boardKinds.includes(entry.kind) ? workSummary(entry, t) : ""}</p>
    <button id="overview-detail-work" type="button" className="button quiet" hidden={!linked} onClick={() => { if (linked) void app.work.open(linked, true); }}>{t("workDetails")}</button>{" "}
    <button id="overview-detail-updates" type="button" className="button quiet" hidden={!linked} data-entry-id={linked?.id} onClick={() => { if (linked) void app.notes.open(linked, true); }}>{linked ? entry ? t("updates", { count: entry._count?.updates || 0 }) : t("viewUpdates") : ""}</button>{" "}
    <a href={history ? "#history" : "#handover"} id="overview-detail-board" className="button secondary" onClick={event => { event.preventDefault(); const target = history ? "history" : "handover"; close(); app.go(target); }}>{t(history ? "openHistory" : "openHandover")}</a>
  </Modal>;
}
function NotesDialog() {
  const t = useT(), language = useApp(state => state.language), notes = useApp(state => state.notes);
  const { active, data, busy, loading, hasDraft } = notes, writable = Boolean(data?.canWrite && !active?.readOnly);
  return <Modal id="updates-dialog" open={Boolean(active)} onDismiss={app.notes.close} busy={busy} labelledBy="updates-title">
    <div className="section-title"><h2 id="updates-title">{active ? t("updatesTitle", { title: data?.entry.title || active.title }) : ""}</h2><button id="updates-close" type="button" className="button quiet small" disabled={busy} onClick={app.notes.close}>{t("close")}</button></div>
    <p className="hint">{t("updatesHint")}</p><p id="updates-mode" className="hint">{data ? t(!data.canWrite ? "updatesClosed" : active?.readOnly ? "updatesReadOnly" : "") : ""}</p>
    <MessageLine id="updates-message" message={notes.message || (loading ? { key: "loading" } : null)} />
    <ol id="updates-list" className="updates-list">{active && (data?.items.length ? data.items.map(item => <li key={item.id} className="update-note"><p className="hint">{item.author.name} · {stamp(item.createdAt, language)}</p><p className="update-body">{item.body}</p></li>) : data && <li className="hint">{t("updatesEmpty")}</li>)}</ol>
    <Pagination prefix="updates" page={data?.page || 1} total={data?.total || 0} busy={busy || loading} previous={() => { void app.notes.load((data?.page || 1) - 1); }} next={() => { void app.notes.load((data?.page || 1) + 1); }} />
    <button id="updates-retry" type="button" className="text-button" disabled={busy || loading} onClick={() => { void app.notes.load(data?.page || 1); }}>{t("refresh")}</button>
    <form id="updates-form" hidden={!data || (!writable && !hasDraft)} onSubmit={event => { event.preventDefault(); void app.notes.save(); }}>
      <p id="updates-draft-state" className="hint" hidden={!hasDraft}>{t("updateUnsent")}</p>
      <Field id="updates-body" label={t("updateBody")} control="textarea" rows={3} maxLength={2000} required value={notes.text} onValue={text => app.notes.changeText(text)} readOnly={!writable} disabled={busy} resetKey={active?.id || 0} />
      <p className="hint">{t("updatePermanent")}</p><button id="updates-save" type="submit" className="button primary" hidden={!writable} disabled={busy || loading}>{t("updateSave")}</button>
    </form>
    <button id="updates-discard" type="button" className="text-button" hidden={!hasDraft} disabled={busy} onClick={app.notes.discard}>{t("updateDiscard")}</button>
    <a href="#handover" id="updates-handover" className="button secondary" hidden={!(data?.canWrite && active?.readOnly)} onClick={event => { event.preventDefault(); app.notes.close(); app.go("handover"); }}>{t("openHandover")}</a>
  </Modal>;
}
function WorkDialog() {
  const t = useT(), language = useApp(state => state.language), work = useApp(state => state.work);
  const { active, data, fields, busy, loading, hasDraft } = work, writable = Boolean(data?.canWrite && !active?.readOnly);
  return <Modal id="work-dialog" open={Boolean(active)} onDismiss={app.work.close} busy={busy} labelledBy="work-title">
    <div className="section-title"><h2 id="work-title">{active ? t("workTitle", { title: data?.entry.title || active.title }) : ""}</h2><button id="work-close" type="button" className="button quiet small" disabled={busy} onClick={app.work.close}>{t("close")}</button></div>
    <p id="work-mode" className="hint">{data ? t(!data.canWrite ? "workClosedHint" : active?.readOnly ? "workReadOnly" : "workEditHint") : ""}</p><MessageLine id="work-message" message={work.message || (loading ? { key: "loading" } : null)} />
    <form id="work-form" hidden={!data && !hasDraft} onSubmit={event => { event.preventDefault(); void app.work.save(); }}>
      <p id="work-draft" className="hint" hidden={!hasDraft}>{t("workUnsent")}</p>
      <Field id="work-status" label={t("workStatusLabel")} control="select" value={fields.workStatus} onValue={workStatus => app.work.changeFields({ workStatus: workStatus as WorkStatus })} disabled={busy || loading || !writable}>{["OPEN", "IN_PROGRESS", "WAITING"].map(value => <option key={value} value={value}>{t("WORK_" + value)}</option>)}<option value="CLOSED" disabled hidden>{t("WORK_CLOSED_STATUS")}</option></Field>
      <Field id="work-team" label={t("workTeam")} value={fields.responsibleTeam} onValue={responsibleTeam => app.work.changeFields({ responsibleTeam })} maxLength={120} placeholder={t("workTeamPlaceholder")} readOnly={!writable} disabled={busy || loading} resetKey={active?.id || 0} />
      <Field id="work-next" label={t("workNext")} control="textarea" rows={3} maxLength={1000} value={fields.nextStep} onValue={nextStep => app.work.changeFields({ nextStep })} readOnly={!writable} disabled={busy || loading} resetKey={active?.id || 0} />
      <button id="work-save" type="submit" className="button primary" hidden={!writable} disabled={busy || loading}>{t("save")}</button>
    </form>
    <div className="dialog-actions"><button id="work-reload" type="button" className="button quiet" disabled={busy || loading} onClick={app.work.reload}>{t("workReload")}</button><button id="work-discard" type="button" className="text-button" hidden={!hasDraft} disabled={busy || loading} onClick={app.work.discard}>{t("workDiscard")}</button></div>
    <h3>{t("workHistory")}</h3><ol id="work-history" className="updates-list">{active && (data?.items.length ? data.items.map(item => <li key={item.id} className="update-note"><p className="hint">{item.author.name} · {stamp(item.createdAt, language)}</p><p className="update-body">{workSummary(item, t)}</p></li>) : data && <li className="hint">{t("workHistoryEmpty")}</li>)}</ol>
    <div className="list-pagination"><button id="work-previous" type="button" className="button quiet small" disabled={busy || loading || !data || data.page <= 1} onClick={() => { if (data) void app.work.load(data.page - 1); }}>{t("previous")}</button><span id="work-page" className="muted">{data?.total ? t("pageLabel", { from: (data.page - 1) * 20 + 1, to: Math.min(data.page * 20, data.total), total: data.total }) : ""}</span><button id="work-next-page" type="button" className="button quiet small" disabled={busy || loading || !data || data.page * 20 >= data.total} onClick={() => { if (data) void app.work.load(data.page + 1); }}>{t("next")}</button></div>
  </Modal>;
}
export function Dialogs() { return <><EquipmentDialog /><CloseDialog /><PhotoDialog /><ObservationDialog /><NotesDialog /><WorkDialog /></>; }
