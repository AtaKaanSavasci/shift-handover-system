import { useEffect, useRef, useState } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { Brand, Preferences, Field, MessageLine } from "./common";
export function AuthView() {
  const t = useT(), user = useApp(state => state.user), busy = useApp(state => state.authBusy), message = useApp(state => state.authMessage), reset = useApp(state => state.authReset);
  const [signup, setSignup] = useState(false), [visible, setVisible] = useState(false);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [validation, setValidation] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null), passwordRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setName(""); setEmail(""); setPassword(""); setCode(""); setVisible(false); setValidation(value => value + 1); if (reset) emailRef.current?.focus(); }, [reset]);
  useEffect(() => { if (user) { setPassword(""); setCode(""); setVisible(false); } }, [user]);
  function switchMode() { setSignup(value => !value); setVisible(false); setCode(""); setValidation(value => value + 1); app.patch({ authMessage: null }); }
  return <div id="auth-view" className="auth-layout" hidden={Boolean(user)}>
    <div className="auth-story"><Brand auth /><div className="story-content"><h1>{t("storyTitle")}</h1><p>{t("storyText")}</p></div></div>
    <main className="auth-main"><div className="auth-theme toolbar"><Preferences /></div><div className="auth-card">
      <h2 id="auth-title">{t(signup ? "signupTitle" : "loginTitle")}</h2><p id="auth-description" className="muted">{t(signup ? "signupDescription" : "loginDescription")}</p>
      <form id="login-form" onReset={() => setVisible(false)} onSubmit={async event => {
        event.preventDefault();
        const success = await app.login({ email, password, ...(signup ? { name, registrationCode: code } : {}) }, signup);
        if (success && signup) { setSignup(false); setPassword(""); setCode(""); setVisible(false); setValidation(value => value + 1); passwordRef.current?.focus(); }
      }}>
        <div id="name-field" hidden={!signup}><Field id="name" name="name" label={t("name")} value={name} onValue={setName} autoComplete="name" maxLength={100} required={signup} resetKey={validation} /></div>
        <Field id="email" name="email" type="email" label={t("email")} value={email} onValue={setEmail} autoComplete="username" maxLength={254} required inputRef={emailRef} resetKey={validation} />
        <Field id="password" name="password" type={visible ? "text" : "password"} label={t("password")} value={password} onValue={setPassword} autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : 1} inputRef={passwordRef} resetKey={validation}
          trailing={<button id="toggle-password" type="button" className="password-toggle" aria-controls="password" aria-label={t(visible ? "hidePassword" : "showPassword")} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{t(visible ? "hide" : "show")}</button>} />
        <p id="password-hint" className="hint" hidden={!signup}>{t("passwordHint")}</p>
        <div id="registration-code-field" hidden={!signup}><Field id="registration-code" name="registrationCode" type="password" label={t("registrationCode")} value={code} onValue={setCode} autoComplete="off" maxLength={128} required={signup} disabled={!signup} hintId="registration-code-hint" resetKey={validation} /><p id="registration-code-hint" className="hint">{t("registrationCodeHint")}</p></div>
        <button type="submit" id="login-button" className="button primary full" disabled={busy}>{t(signup ? "signup" : "login")}</button>
      </form>
      <p className="switch-auth"><span id="switch-label">{t(signup ? "hasAccount" : "noAccount")}</span>{" "}<button id="switch-auth" type="button" className="text-button" disabled={busy} onClick={switchMode}>{t(signup ? "login" : "signup")}</button></p>
      <MessageLine id="auth-message" message={message} />
    </div></main>
  </div>;
}
