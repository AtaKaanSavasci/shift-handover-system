import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import type { Entry, Message, WorkFields } from "../state/types";
import { translateApiError } from "../lib/i18n";

export const workStatusKey = (entry: Entry) => entry.closedAt ? "WORK_CLOSED_STATUS" : "WORK_" + (entry.workStatus || "OPEN");
export function workSummary(entry: Partial<WorkFields> & { closedAt?: string | null }, t: ReturnType<typeof useT>) {
  return [t(workStatusKey(entry as Entry)), ...(entry.responsibleTeam ? [t("workTeamValue", { team: entry.responsibleTeam })] : []), ...(entry.nextStep ? [t("workNextValue", { step: entry.nextStep })] : [])].join(" · ");
}
export function Icon({ name, className = "", size = 20 }: { name: string; className?: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></>,
    plus: <path d="M12 4v16M4 12h16" />,
    handover: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M9 10h6m-6 5h6" /></>,
    history: <path d="M3 12a9 9 0 1 0 3-7M3 3v6h6m3-2v5l3 2" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></>,
    moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    chat: <><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-7a8 8 0 1 1 18-3Z" /><path d="M8 10h8m-8 4h5" /></>,
    refresh: <path d="M20 7v5h-5M4 17v-5h5m10-4a8 8 0 0 0-14-1m0 9a8 8 0 0 0 14 1" />
  };
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.plus}</svg>;
}
export function Preferences() {
  const t = useT(), language = useApp(state => state.language), theme = useApp(state => state.theme);
  return <><label className="language-control" title={t("chooseLanguage") + " · " + (language === "en" ? "English" : "Türkçe")}><span className="language-symbol" aria-hidden="true">文<span>A</span></span><select className="language-select" data-language="" aria-label={t("chooseLanguage")} value={language} onChange={event => app.setLanguage(event.target.value === "en" ? "en" : "tr")}><option value="tr">Türkçe</option><option value="en">English</option></select></label>
    <button type="button" className="theme-toggle" role="switch" data-theme-toggle="" aria-label={t("darkTheme")} aria-checked={theme === "dark"} title={t(theme === "dark" ? "lightLabel" : "darkLabel")} onClick={app.toggleTheme}><span className="theme-track" aria-hidden="true"><span className="theme-thumb"><Icon name="sun" size={14} className="theme-sun" /><Icon name="moon" size={14} className="theme-moon" /></span></span></button></>;
}
export function Brand({ auth = false }: { auth?: boolean }) {
  const t = useT();
  return <a className="brand" href={auth ? "/app/" : "#overview"}><span className="brand-icon" aria-hidden="true">v.</span><span><span>{t("brand")}</span><small>{t("tagline")}</small></span></a>;
}
export function MessageLine({ id, message, className = "", alert = false }: { id: string; message: Message | null; className?: string; alert?: boolean }) {
  const t = useT(), language = useApp(state => state.language);
  const text = message ? message.key ? t(message.key) : message.api ? translateApiError(language, message.api) : message.text || t("failed") : "";
  return <p id={id} className={"message " + className + (message?.error ? " error" : "")} role={alert ? "alert" : "status"} aria-live="polite">{text}</p>;
}
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FieldProps = {
  id: string; label?: string; value: string; onValue: (value: string) => void; control?: "input" | "textarea" | "select";
  name?: string; type?: string; maxLength?: number; minLength?: number; required?: boolean; disabled?: boolean; readOnly?: boolean;
  rows?: number; autoComplete?: string; placeholder?: string; hintId?: string; resetKey?: string | number; trailing?: ReactNode;
  children?: ReactNode; inputRef?: Ref<HTMLInputElement>; className?: string;
};
function invalidity(field: Control): { key: string; count?: number } | null {
  if (!field.willValidate || field.validity.valid) return null;
  const v = field.validity;
  if (v.valueMissing) return { key: "fieldRequired" };
  if (v.typeMismatch && field instanceof HTMLInputElement && field.type === "email") return { key: "fieldEmail" };
  if (v.tooShort && "minLength" in field) return { key: "fieldMinLength", count: field.minLength };
  if (v.tooLong && "maxLength" in field) return { key: "fieldMaxLength", count: field.maxLength };
  return { key: "fieldInvalid" };
}
export function Field(props: FieldProps) {
  const { id, label, value, onValue, control = "input", hintId, resetKey, trailing, children, inputRef } = props;
  const t = useT(), [error, setError] = useState<ReturnType<typeof invalidity>>(null);
  useEffect(() => { setError(null); }, [resetKey]);
  useEffect(() => { if (props.disabled) setError(null); }, [props.disabled]);
  const shared = {
    id, name: props.name, value, disabled: props.disabled, required: props.required,
    className: props.className, "aria-invalid": error ? true as const : undefined,
    "aria-describedby": [hintId, error ? id + "-error" : ""].filter(Boolean).join(" ") || undefined,
    onInvalid: (event: React.InvalidEvent<Control>) => setError(invalidity(event.currentTarget)),
    onChange: (event: React.ChangeEvent<Control>) => { onValue(event.currentTarget.value); if (error) setError(invalidity(event.currentTarget)); }
  };
  const element = control === "select" ? <select {...shared}>{children}</select>
    : control === "textarea" ? <textarea {...shared} maxLength={props.maxLength} minLength={props.minLength} rows={props.rows} readOnly={props.readOnly} placeholder={props.placeholder} />
    : <input {...shared} ref={inputRef} type={props.type || "text"} maxLength={props.maxLength} minLength={props.minLength} autoComplete={props.autoComplete} readOnly={props.readOnly} placeholder={props.placeholder} />;
  return <>{label && <label htmlFor={id}>{label}</label>}{trailing ? <div className="password-field">{element}{trailing}</div> : element}{error && <p id={id + "-error"} className="field-error">{t(error.key, { count: error.count || 0 })}</p>}</>;
}
export function Modal({ id, open, onDismiss, busy = false, labelledBy, children }: { id: string; open: boolean; onDismiss: () => void; busy?: boolean; labelledBy?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  useEffect(() => () => { ref.current?.close(); }, []);
  return <dialog ref={ref} id={id} aria-labelledby={labelledBy} onCancel={event => { event.preventDefault(); if (!busy) onDismiss(); }} onClose={() => { if (open && !ref.current?.open) onDismiss(); }}>{children}</dialog>;
}
export function Pagination({ prefix, page, total, busy, previous, next }: { prefix: string; page: number; total: number; busy: boolean; previous: () => void; next: () => void }) {
  const t = useT();
  return <div className="list-pagination"><button id={prefix + "-previous"} type="button" className="button quiet small" disabled={busy || page <= 1} onClick={previous}>{t("previous")}</button><span id={prefix + "-page"} className="muted">{total ? t("pageLabel", { from: (page - 1) * 20 + 1, to: Math.min(page * 20, total), total }) : t("zero")}</span><button id={prefix + "-next"} type="button" className="button quiet small" disabled={busy || page * 20 >= total} onClick={next}>{t("next")}</button></div>;
}
