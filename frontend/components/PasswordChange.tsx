import { useState } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { errorMessage, isAbort } from "../state/errors";
import { Brand, Field, MessageLine, Preferences } from "./common";
import type { Message } from "../state/types";

/** Shown after signing in with a temporary password; nothing else is reachable until it is replaced. */
export function PasswordChange() {
  const t = useT(), user = useApp(state => state.user);
  const [current, setCurrent] = useState(""), [next, setNext] = useState(""), [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<Message | null>(null);
  if (!user?.mustChangePassword) return null;
  return <div id="password-change" className="auth-layout">
    <div className="auth-story"><Brand auth /><div className="story-content"><h1>{t("passwordChangeStory")}</h1></div></div>
    <main className="auth-main"><div className="auth-theme toolbar"><Preferences /></div><div className="auth-card">
      <h2>{t("passwordChangeTitle")}</h2><p className="muted">{t("passwordChangeHint", { name: user.name })}</p>
      <form id="password-change-form" onSubmit={async event => {
        event.preventDefault();
        if (next !== repeat) { setMessage({ key: "passwordMismatch", error: true }); return; }
        setBusy(true); setMessage(null);
        try { await app.changePassword(current, next); }
        catch (error) { if (!isAbort(error)) setMessage(errorMessage(error)); }
        finally { setBusy(false); }
      }}>
        <Field id="current-password" type="password" label={t("temporaryPasswordLabel")} value={current} onValue={setCurrent} autoComplete="current-password" required disabled={busy} />
        <Field id="new-password" type="password" label={t("newPasswordLabel")} value={next} onValue={setNext} autoComplete="new-password" required minLength={12} disabled={busy} />
        <Field id="repeat-password" type="password" label={t("repeatPasswordLabel")} value={repeat} onValue={setRepeat} autoComplete="new-password" required minLength={12} disabled={busy} />
        <p className="hint">{t("passwordHint")}</p>
        <button type="submit" className="button primary full" disabled={busy}>{t("passwordChangeSubmit")}</button>
      </form>
      <p className="switch-auth"><button type="button" className="text-button" onClick={app.requestLogout}>{t("logout")}</button></p>
      <MessageLine id="password-change-message" message={message} />
    </div></main>
  </div>;
}
