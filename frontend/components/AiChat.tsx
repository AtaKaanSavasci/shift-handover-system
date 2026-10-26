import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { app } from "../state/store";
import { useApp, useT } from "../state/hooks";
import { Icon, MessageLine } from "./common";
export function AiChat() {
  const t = useT(), ai = useApp(state => state.ai), saving = useApp(state => state.entrySending);
  const launcher = useRef<HTMLButtonElement>(null), input = useRef<HTMLTextAreaElement>(null), scroll = useRef<HTMLDivElement>(null), previousOpen = useRef(false);
  useEffect(() => {
    if (ai.open && !previousOpen.current) input.current?.focus();
    if (!ai.open && previousOpen.current && app.getSnapshot().user) launcher.current?.focus();
    previousOpen.current = ai.open;
  }, [ai.open]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && app.getSnapshot().ai.open && !document.querySelector("dialog[open]")) { event.preventDefault(); app.ai.close(); }
    };
    document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape);
  }, []);
  useLayoutEffect(() => {
    const container = scroll.current;
    if (container && ai.open) container.scrollTop = container.scrollHeight;
  }, [ai.open, ai.bubbles, ai.result]);
  const status = ai.message || { key: !ai.available ? "aiChecking" : !ai.enabled ? "aiDisabled" : "aiChatReady" };
  const needsText = app.ai.needsText(), result = ai.result;
  return <><button ref={launcher} id="ai-launcher" type="button" className="ai-launcher" aria-controls="ai-chat" aria-expanded={ai.open} aria-label={t("aiOpen")} onClick={app.ai.toggle}><Icon name="chat" size={25} /><span>AI</span></button>
    <section id="ai-chat" className="ai-assistant ai-chat" role="dialog" aria-modal="false" aria-labelledby="ai-title" hidden={!ai.open}>
      <header className="ai-chat-header"><div><span className="eyebrow">{t("aiChatLabel")}</span><h2 id="ai-title">{t("aiTitle")}</h2></div><button id="ai-chat-close" type="button" className="button quiet small" aria-label={t("aiClose")} onClick={app.ai.close}><span aria-hidden="true">×</span></button></header>
      <div id="ai-chat-scroll" className="ai-chat-scroll" ref={scroll}><p className="ai-chat-welcome">{t("aiChatWelcome")}</p><p className="hint">{t("aiDisclosure")}</p>
        <div id="ai-messages" className="ai-messages" role="log" aria-live="polite" aria-label={t("aiConversation")} aria-busy={ai.busy}>{ai.bubbles.map(item => <div key={item.id} className={"ai-bubble ai-bubble-" + item.role}><strong>{t(item.role === "user" ? "aiYou" : "aiTitle")}</strong><p>{item.text}</p></div>)}</div>
        <MessageLine id="ai-status" message={status} className="hint" />
        <div id="ai-result" hidden={!result}><p className="ai-notice">{t("aiNotice")}</p><div id="ai-details">{result && <><dl>{[
          ["unit", result.equipment === "GENERAL" ? t("general") : result.equipment === "UNKNOWN" ? t("aiUnknown") : result.equipment],
          ["aiCategory", t("aiCategory" + result.category)], ["kind", t(result.kind)], ["aiReviewPriority", t(result.priority === "UNKNOWN" ? "aiUnknown" : result.priority)], ["aiReason", result.rationale], ["aiUncertainty", result.uncertainty]
        ].map(([key, value]) => <Fragment key={key}><dt>{t(key!)}</dt><dd>{value}</dd></Fragment>)}</dl><h4>{t("aiEvidence")}</h4><ul>{result.evidence.map((text, i) => <li key={i}>{text}</li>)}</ul><h4>{t("aiQuestions")}</h4>{result.questions.length ? <ul>{result.questions.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p>{t("aiNoQuestions")}</p>}</>}</div>
          <fieldset className="ai-selections"><legend>{t("aiSelect")}</legend><label id="ai-text-option" hidden={!needsText}><input id="ai-use-text" type="checkbox" checked={ai.selections.text} disabled={saving} onChange={event => app.ai.selection("text", event.target.checked)} /><span>{t("aiUseText")}</span></label>
            <label><input id="ai-use-unit" type="checkbox" checked={ai.selections.unit} disabled={result?.equipment === "UNKNOWN"} onChange={event => app.ai.selection("unit", event.target.checked)} /><span>{t("unit")}</span></label>
            <label><input id="ai-use-kind" type="checkbox" checked={ai.selections.kind} onChange={event => app.ai.selection("kind", event.target.checked)} /><span>{t("kind")}</span></label>
            <label><input id="ai-use-priority" type="checkbox" checked={ai.selections.priority} disabled={result?.priority === "UNKNOWN"} onChange={event => app.ai.selection("priority", event.target.checked)} /><span>{t("priority")}</span></label>
          </fieldset><div className="ai-actions"><button id="ai-apply" type="button" className="button secondary small" disabled={!app.ai.canApply()} onClick={app.ai.apply}>{t("aiApply")}</button><button id="ai-dismiss" type="button" className="button quiet small" onClick={() => { app.ai.invalidate("aiDismissed"); input.current?.focus(); }}>{t("aiDismiss")}</button></div><p className="hint">{t("aiSaveHint")}</p>
        </div>
      </div>
      <form id="ai-chat-form" className="ai-composer" onSubmit={event => { event.preventDefault(); void app.ai.send(); }}><div className="ai-composer-tools"><button id="ai-import" type="button" className="text-button" disabled={ai.busy || saving} onClick={() => { app.ai.importDraft(); input.current?.focus(); }}>{t("aiImport")}</button><button id="ai-clear" type="button" className="text-button" onClick={() => { app.ai.clearWithConfirmation(); input.current?.focus(); }}>{t("aiClear")}</button></div>
        <label htmlFor="ai-chat-input">{t("aiMessage")}</label><textarea ref={input} id="ai-chat-input" rows={3} maxLength={4000} placeholder={t("aiPlaceholder")} value={ai.text} onChange={event => app.ai.changeText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void app.ai.send(); } }} />
        <div className="ai-send-row"><small className="hint">{t("aiKeyboard")}</small><button id="ai-analyze" type="submit" className="button secondary" disabled={!ai.enabled || ai.busy || saving}>{t(ai.busy ? "aiAnalyzing" : "aiSend")}</button></div>
      </form>
    </section>
  </>;
}
