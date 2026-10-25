import { useEffect, useRef } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import type { Kind, Priority, WorkStatus } from "../state/types";
import { boardKinds } from "../lib/format";
import { Field, MessageLine } from "./common";
export function EntryForm() {
  const t = useT(), entry = useApp(state => state.entry), photos = useApp(state => state.photos), busy = useApp(state => state.entrySending);
  const message = useApp(state => state.entryMessage), reset = useApp(state => state.entryReset), focus = useApp(state => state.entryFocus);
  const title = useRef<HTMLInputElement>(null), form = useRef<HTMLFormElement>(null), files = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const work = boardKinds.includes(entry.kind), dirty = app.entryDirty();
  useEffect(() => { if (focus) { form.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" }); title.current?.focus({ preventScroll: true }); } }, [focus]);
  const addFiles = (input: HTMLInputElement) => { app.addPhotos([...input.files || []]); input.value = ""; };
  return <section className="panel" aria-labelledby="new-entry-title"><h2 id="new-entry-title">{t("newEntry")}</h2><p className="muted panel-intro">{t("entryHint")}</p>
    <div className="quick-actions" aria-label={t("quickAdd")}><span className="eyebrow">{t("quickAdd")}</span>{([["EVENT", "quickEvent"], ["VALVE", "quickValve"], ["TASK", "quickTask"], ["ATTENTION", "quickAttention"], ["NOTE", "quickNote"]] as const).map(([kind, key]) => <button key={kind} type="button" className="button secondary small" data-quick-kind={kind} disabled={busy} onClick={() => app.quickEntry(kind)}>{t(key)}</button>)}</div>
    <form id="entry-form" ref={form} aria-busy={busy || undefined} onSubmit={event => { event.preventDefault(); void app.saveEntry(); }} onReset={() => { if (!busy) app.resetEntry(); }}>
      <div className="two-fields"><div><Field id="entry-kind" name="kind" label={t("kind")} control="select" value={entry.kind} onValue={kind => app.changeEntry({ kind: kind as Kind })} disabled={busy}>{(["EVENT", "NOTE", "VALVE", "ATTENTION", "TASK"] as const).map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}</Field></div><div><Field id="entry-priority" name="priority" label={t("priority")} control="select" value={entry.priority} onValue={priority => app.changeEntry({ priority: priority as Priority })} disabled={busy}><option value="NORMAL">{t("NORMAL")}</option><option value="HIGH">{t("HIGH")}</option></Field></div></div>
      <Field id="entry-unit" name="equipmentCode" label={t("unit")} control="select" value={entry.equipmentCode} onValue={equipmentCode => app.changeEntry({ equipmentCode })} disabled={busy}><option value="">{t("general")}</option>{["GT1", "GT2", "ST"].map(code => <option key={code} value={code}>{code}</option>)}</Field>
      <Field id="entry-title" name="title" label={t("title")} value={entry.title} onValue={title => app.changeEntry({ title })} maxLength={160} required disabled={busy} resetKey={reset} inputRef={title} />
      <Field id="entry-description" name="description" label={t("description")} control="textarea" value={entry.description} onValue={description => app.changeEntry({ description })} maxLength={4000} rows={4} required disabled={busy} resetKey={reset} />
      <fieldset id="entry-work-fields" className="work-fields" hidden={!work}><legend>{t("workDetails")}</legend>
        <Field id="entry-work-status" name="workStatus" label={t("workStatusLabel")} control="select" value={entry.workStatus} onValue={workStatus => app.changeEntry({ workStatus: workStatus as WorkStatus })} disabled={!work || busy}>{(["OPEN", "IN_PROGRESS", "WAITING"] as const).map(value => <option key={value} value={value}>{t("WORK_" + value)}</option>)}</Field>
        <Field id="entry-work-team" name="responsibleTeam" label={t("workTeam")} value={entry.responsibleTeam} onValue={responsibleTeam => app.changeEntry({ responsibleTeam })} maxLength={120} placeholder={t("workTeamPlaceholder")} disabled={!work || busy} resetKey={reset} />
        <Field id="entry-work-next" name="nextStep" label={t("workNext")} control="textarea" value={entry.nextStep} onValue={nextStep => app.changeEntry({ nextStep })} rows={2} maxLength={1000} disabled={!work || busy} resetKey={reset} />
      </fieldset>
      <label htmlFor="entry-photos">{t("photos")}</label><input ref={files} id="entry-photos" name="photos" type="file" hidden accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={event => addFiles(event.currentTarget)} />
      <p className="hint">{t("photoHint")}</p><button type="button" id="choose-photos" className="button quiet small" disabled={busy} onClick={() => files.current?.click()}>{t("choosePhotos")}</button>{" "}
      <input ref={camera} id="camera-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden disabled={busy} onChange={event => addFiles(event.currentTarget)} /><button type="button" id="take-photo" className="button quiet small" disabled={busy} onClick={() => camera.current?.click()}>{t("takePhoto")}</button>
      <p id="photo-count" className="hint">{t("selectedPhotos", { count: photos.length })}</p><div id="photo-previews" className="photo-previews">{photos.map(item => <figure key={item.url} className="photo-preview"><img src={item.url} alt={item.file.name} /><figcaption>{item.file.name}</figcaption><button type="button" className="text-button" disabled={busy} onClick={() => app.removePhoto(item.url)}>{t("removePhoto")}</button></figure>)}</div>
      <p id="draft-hint" className="hint" hidden={!dirty}>{t("draftHint")}</p><MessageLine id="entry-message" message={message} className="entry-message" />
      <button id="entry-save" type="submit" className="button primary full" disabled={busy}>{t(busy ? "saveProgress" : "save")}</button>
    </form>
  </section>;
}
