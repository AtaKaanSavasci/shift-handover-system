import { useCallback, useEffect, useState, type FormEvent } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { stamp } from "../lib/format";
import { isAbort } from "../state/errors";
import type { AdminUnit, AdminUser, AuditEntry, PageResult, Role } from "../state/types";
import { Field, Pagination } from "./common";

type T = ReturnType<typeof useT>;
type Section = "users" | "units" | "audit";
const roles: Role[] = ["WORKER", "SUPERVISOR", "MANAGER"];

/** Runs an admin request, reporting failures through the dashboard message line. */
async function run<R>(work: () => Promise<R>, setBusy: (busy: boolean) => void): Promise<R | undefined> {
  setBusy(true);
  try { return await work(); }
  catch (error) { if (!isAbort(error)) app.showError(error); return undefined; }
  finally { setBusy(false); }
}

/** Two-step button: the first click asks inline, the second performs the action. */
function Confirm({ t, label, question, disabled, onConfirm }: { t: T; label: string; question: string; disabled: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  return asking ? <span className="confirm-inline" role="group" aria-label={question}><span>{question}</span>
    <button type="button" className="button primary small" disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{t("confirmYes")}</button>
    <button type="button" className="button quiet small" onClick={() => setAsking(false)}>{t("cancel")}</button></span>
    : <button type="button" className="button quiet small" disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
}

/** One-time credential panel shown after creating a user or resetting a password. */
function TemporaryPassword({ t, value, onClose }: { t: T; value: { name: string; email: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return <div className="panel admin-secret" role="alert" id="temporary-password">
    <div><h3>{t("tempPasswordTitle", { name: value.name })}</h3><p className="muted">{t("tempPasswordHint")}</p></div>
    <p className="admin-secret-value"><span className="muted">{value.email}</span><code id="temporary-password-value">{value.password}</code></p>
    <div className="admin-actions">
      <button type="button" className="button secondary small" onClick={() => { void navigator.clipboard?.writeText(value.password).then(() => setCopied(true), () => setCopied(false)); }}>{t(copied ? "copied" : "copy")}</button>
      <button type="button" className="button quiet small" onClick={onClose}>{t("tempPasswordDone")}</button>
    </div>
  </div>;
}

function Users({ t }: { t: T }) {
  const me = useApp(state => state.user), language = useApp(state => state.language);
  const [users, setUsers] = useState<AdminUser[] | null>(null), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", role: "WORKER" as Role }), [secret, setSecret] = useState<{ name: string; email: string; password: string } | null>(null);
  const load = useCallback(() => run(async () => setUsers((await app.read<{ items: AdminUser[] }>("/admin/users")).items), setBusy), []);
  useEffect(() => { void load(); }, [load]);
  const update = (user: AdminUser, body: Partial<Pick<AdminUser, "role" | "active">>, message: string) => run(async () => {
    await app.json(`/admin/users/${user.id}`, "PATCH", body); app.notify({ key: message }); await load();
  }, setBusy);
  async function create(event: FormEvent) {
    event.preventDefault();
    const result = await run(() => app.json<{ user: AdminUser; temporaryPassword: string }>("/admin/users", "POST", draft), setBusy);
    if (result) { setSecret({ name: result.user.name, email: result.user.email, password: result.temporaryPassword }); setDraft({ name: "", email: "", role: "WORKER" }); app.notify({ key: "userCreated" }); await load(); }
  }
  async function reset(user: AdminUser) {
    const result = await run(() => app.json<{ user: AdminUser; temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`, "POST", {}), setBusy);
    if (result) { setSecret({ name: user.name, email: user.email, password: result.temporaryPassword }); await load(); }
  }
  return <>
    {secret && <TemporaryPassword t={t} value={secret} onClose={() => setSecret(null)} />}
    <section className="panel" aria-labelledby="admin-new-user-title">
      <div className="section-title"><div><h2 id="admin-new-user-title">{t("newUserTitle")}</h2><p className="muted">{t("newUserHint")}</p></div></div>
      <form id="admin-new-user" className="admin-form" onSubmit={event => { void create(event); }}>
        <div><Field id="new-user-name" label={t("name")} value={draft.name} onValue={name => setDraft({ ...draft, name })} required maxLength={100} disabled={busy} /></div>
        <div><Field id="new-user-email" type="email" label={t("email")} value={draft.email} onValue={email => setDraft({ ...draft, email })} required maxLength={254} disabled={busy} /></div>
        <div><Field id="new-user-role" control="select" label={t("roleLabel")} value={draft.role} onValue={role => setDraft({ ...draft, role: role as Role })} disabled={busy}>{roles.map(role => <option key={role} value={role}>{t(role)}</option>)}</Field></div>
        <button type="submit" className="button primary" disabled={busy}>{t("createUser")}</button>
      </form>
    </section>
    <section className="panel" aria-labelledby="admin-users-title">
      <div className="section-title"><div><h2 id="admin-users-title">{t("usersTitle")}</h2><p className="muted">{t("usersHint")}</p></div></div>
      {!users ? <p className="hint">{t("summaryLoading")}</p> : <div className="table-wrap"><table id="admin-users" className="admin-table">
        <thead><tr><th scope="col">{t("name")}</th><th scope="col">{t("roleLabel")}</th><th scope="col">{t("accountStatus")}</th><th scope="col"><span className="sr-only">{t("actions")}</span></th></tr></thead>
        <tbody>{users.map(user => { const self = user.id === me?.id; return <tr key={user.id} data-user-id={user.id} className={user.active ? "" : "inactive"}>
          <th scope="row"><strong>{user.name}{self ? " " + t("you") : ""}</strong><small>{user.email}</small><small>{t("memberSince", { date: stamp(user.createdAt, language) })}</small></th>
          <td><select aria-label={t("roleFor", { name: user.name })} value={user.role} disabled={busy || self} onChange={event => { void update(user, { role: event.target.value as Role }, "roleChanged"); }}>{roles.map(role => <option key={role} value={role}>{t(role)}</option>)}</select></td>
          <td><span className={"status " + (user.active ? "active" : "")}>{t(user.active ? "accountActive" : "accountDisabled")}</span>{user.mustChangePassword && <small className="hint">{t("awaitingPassword")}</small>}</td>
          <td className="admin-actions">{!self && <>
            <Confirm t={t} label={t("resetPassword")} question={t("resetConfirm", { name: user.name })} disabled={busy || !user.active} onConfirm={() => { void reset(user); }} />
            {user.active ? <Confirm t={t} label={t("deactivate")} question={t("deactivateConfirm", { name: user.name })} disabled={busy} onConfirm={() => { void update(user, { active: false }, "userDeactivated"); }} />
              : <button type="button" className="button quiet small" disabled={busy} onClick={() => { void update(user, { active: true }, "userReactivated"); }}>{t("reactivate")}</button>}
          </>}</td>
        </tr>; })}</tbody>
      </table></div>}
    </section>
  </>;
}

function Units({ t }: { t: T }) {
  const [units, setUnits] = useState<AdminUnit[] | null>(null), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", description: "" }), [editing, setEditing] = useState<{ code: string; name: string; description: string } | null>(null);
  const load = useCallback(() => run(async () => setUnits((await app.read<{ items: AdminUnit[] }>("/admin/units")).items), setBusy), []);
  useEffect(() => { void load(); }, [load]);
  // Every catalog change refreshes the pickers and status panels used elsewhere in the app.
  const after = async (message: string) => { app.notify({ key: message }); await Promise.all([load(), app.loadUnits()]); };
  const active = units?.filter(unit => !unit.archivedAt) ?? [], archived = units?.filter(unit => unit.archivedAt) ?? [];
  async function create(event: FormEvent) {
    event.preventDefault();
    if (await run(() => app.json("/admin/units", "POST", { code: draft.code, name: draft.name || draft.code, description: draft.description }), setBusy)) { setDraft({ code: "", name: "", description: "" }); await after("unitCreated"); }
  }
  const patch = async (code: string, body: Record<string, unknown>, message: string) => { if (await run(() => app.json(`/admin/units/${encodeURIComponent(code)}`, "PATCH", body), setBusy)) await after(message); };
  const move = async (index: number, delta: number) => {
    const codes = active.map(unit => unit.code), [moved] = codes.splice(index, 1); codes.splice(index + delta, 0, moved!);
    if (await run(() => app.json("/admin/units/order", "POST", { codes }), setBusy)) await after("unitsReordered");
  };
  return <>
    <section className="panel" aria-labelledby="admin-new-unit-title">
      <div className="section-title"><div><h2 id="admin-new-unit-title">{t("newUnitTitle")}</h2><p className="muted">{t("newUnitHint")}</p></div></div>
      <form id="admin-new-unit" className="admin-form" onSubmit={event => { void create(event); }}>
        <div><Field id="new-unit-code" label={t("unitCodeLabel")} value={draft.code} onValue={code => setDraft({ ...draft, code: code.toUpperCase() })} required maxLength={16} placeholder="GT3" disabled={busy} /></div>
        <div><Field id="new-unit-name" label={t("unitNameLabel")} value={draft.name} onValue={name => setDraft({ ...draft, name })} maxLength={80} disabled={busy} /></div>
        <div className="wide"><Field id="new-unit-description" label={t("unitDescriptionLabel")} value={draft.description} onValue={description => setDraft({ ...draft, description })} maxLength={300} disabled={busy} /></div>
        <button type="submit" className="button primary" disabled={busy}>{t("createUnit")}</button>
      </form>
    </section>
    <section className="panel" aria-labelledby="admin-units-title">
      <div className="section-title"><div><h2 id="admin-units-title">{t("unitsTitle")}</h2><p className="muted">{t("unitsHint")}</p></div></div>
      {!units ? <p className="hint">{t("summaryLoading")}</p> : <ol id="admin-units" className="admin-units">{active.map((unit, index) => <li key={unit.code} data-unit={unit.code}>
        {editing?.code === unit.code ? <form className="admin-unit-edit" onSubmit={event => { event.preventDefault(); void patch(unit.code, { name: editing.name, description: editing.description }, "unitUpdated").then(() => setEditing(null)); }}>
          <Field id={"unit-name-" + unit.code} label={t("unitNameLabel")} value={editing.name} onValue={name => setEditing({ ...editing, name })} required maxLength={80} disabled={busy} />
          <Field id={"unit-description-" + unit.code} label={t("unitDescriptionLabel")} value={editing.description} onValue={description => setEditing({ ...editing, description })} maxLength={300} disabled={busy} />
          <div className="admin-actions"><button type="submit" className="button primary small" disabled={busy}>{t("save")}</button><button type="button" className="button quiet small" onClick={() => setEditing(null)}>{t("cancel")}</button></div>
        </form> : <>
          <div className="admin-unit-text"><strong>{unit.code}</strong>{unit.name !== unit.code && <span>{unit.name}</span>}<small className="muted">{unit.description || "—"}</small><small className="hint">{t("unitEntries", { count: unit.entries })}</small></div>
          <div className="admin-actions">
            <button type="button" className="button quiet small" aria-label={t("moveUp", { code: unit.code })} disabled={busy || index === 0} onClick={() => { void move(index, -1); }}>↑</button>
            <button type="button" className="button quiet small" aria-label={t("moveDown", { code: unit.code })} disabled={busy || index === active.length - 1} onClick={() => { void move(index, 1); }}>↓</button>
            <button type="button" className="button quiet small" disabled={busy} onClick={() => setEditing({ code: unit.code, name: unit.name, description: unit.description })}>{t("edit")}</button>
            <Confirm t={t} label={t("archive")} question={t("archiveConfirm", { code: unit.code })} disabled={busy} onConfirm={() => { void patch(unit.code, { archived: true }, "unitArchived"); }} />
          </div>
        </>}
      </li>)}</ol>}
      {archived.length > 0 && <><h3 className="admin-subtitle">{t("archivedUnits")}</h3><ul id="admin-archived-units" className="admin-units archived">{archived.map(unit => <li key={unit.code} data-unit={unit.code}>
        <div className="admin-unit-text"><strong>{unit.code}</strong>{unit.name !== unit.code && <span>{unit.name}</span>}<small className="hint">{t("unitEntries", { count: unit.entries })}</small></div>
        <div className="admin-actions"><button type="button" className="button quiet small" disabled={busy} onClick={() => { void patch(unit.code, { archived: false }, "unitRestored"); }}>{t("restore")}</button></div>
      </li>)}</ul></>}
    </section>
  </>;
}

function auditText(entry: AuditEntry, t: T) {
  const d = entry.details as Record<string, any>;
  const target = entry.targetType === "UNIT" ? entry.targetId : String(d.email ?? "#" + entry.targetId);
  switch (entry.action) {
    case "USER_ROLE_CHANGED": return t("auditUSER_ROLE_CHANGED", { target, from: t(d.from), to: t(d.to) });
    case "USER_CREATED": return t("auditUSER_CREATED", { target, role: t(d.role) });
    case "UNITS_REORDERED": return t("auditUNITS_REORDERED", { codes: (d.codes as string[] ?? []).join(", ") });
    default: return t("audit" + entry.action, { target });
  }
}

function Audit({ t }: { t: T }) {
  const language = useApp(state => state.language);
  const [data, setData] = useState<PageResult<AuditEntry> | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback((page: number) => run(async () => setData(await app.read<PageResult<AuditEntry>>("/admin/audit?page=" + page)), setBusy), []);
  useEffect(() => { void load(1); }, [load]);
  return <section className="panel" aria-labelledby="admin-audit-title">
    <div className="section-title"><div><h2 id="admin-audit-title">{t("auditTitle")}</h2><p className="muted">{t("auditHint")}</p></div><button type="button" className="button quiet small" disabled={busy} onClick={() => { void load(data?.page ?? 1); }}>{t("refresh")}</button></div>
    {!data ? <p className="hint">{t("summaryLoading")}</p> : data.items.length === 0 ? <p className="overview-empty">{t("auditEmpty")}</p> :
      <ol id="admin-audit" className="admin-audit">{data.items.map(entry => <li key={entry.id} data-action={entry.action}>
        <span>{auditText(entry, t)}</span><small className="hint">{entry.actor.name} · {stamp(entry.createdAt, language)}</small>
      </li>)}</ol>}
    {data && data.total > data.pageSize && <Pagination prefix="audit" page={data.page} total={data.total} busy={busy} previous={() => { void load(data.page - 1); }} next={() => { void load(data.page + 1); }} />}
  </section>;
}

export function Admin() {
  const t = useT(), user = useApp(state => state.user), page = useApp(state => state.page);
  const [section, setSection] = useState<Section>("users");
  if (!user || page !== "admin") return null;
  if (user.role !== "MANAGER") return <p className="overview-empty" id="admin-forbidden">{t("adminOnly")}</p>;
  return <div className="admin">
    <div className="segmented admin-tabs" role="tablist" aria-label={t("navAdmin")}>{(["users", "units", "audit"] as const).map(key =>
      <button key={key} type="button" role="tab" id={"admin-tab-" + key} aria-selected={section === key} onClick={() => setSection(key)}>{t("adminTab_" + key)}</button>)}</div>
    {section === "users" ? <Users t={t} /> : section === "units" ? <Units t={t} /> : <Audit t={t} />}
  </div>;
}
