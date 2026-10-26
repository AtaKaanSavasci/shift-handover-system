import type { AppStore } from "./store";
import type { AiState, Analysis } from "./types";
import { emptyAi } from "./defaults";
import { ApiError, isAbort } from "./errors";
const errorKeys: Record<string, string> = { AI_KEY_INVALID: "aiKeyInvalid", AI_ACCESS_DENIED: "aiAccessDenied", AI_QUOTA: "aiQuota", AI_PROVIDER_RATE_LIMIT: "aiProviderRateLimit", AI_MODEL_UNAVAILABLE: "aiModelUnavailable", AI_CONFIGURATION: "aiConfiguration", AI_TIMEOUT: "aiTimeout", AI_CONNECTION: "aiConnection", AI_INVALID_RESPONSE: "aiInvalidResponse", AI_INCOMPLETE: "aiIncomplete", AI_REFUSED: "aiRefused", AI_RATE_LIMIT: "aiRateLimit", AI_BUSY: "aiBusy", AI_DISABLED: "aiDisabled" };
export class AiController {
  private version = 0;
  private composerVersion = 0;
  private statusVersion = 0;
  private bubbleId = 0;
  constructor(private app: AppStore) {}
  get state() { return this.app.getSnapshot().ai; }
  private set(patch: Partial<AiState>) { this.app.patch({ ai: { ...this.state, ...patch } }); }
  private draft() { const state = this.app.getSnapshot(); return { title: state.entry.title, description: state.entry.description, language: state.language }; }
  dirty = () => Boolean(this.state.record || this.state.text.trim());
  snapshot = () => ({ record: this.state.record, recordTitle: this.state.recordTitle, text: this.state.text });
  restore(saved: ReturnType<AiController["snapshot"]>) { this.clear(); this.set({ ...saved, message: { key: "aiChatRestored" } }); }
  reset() { this.version++; this.statusVersion++; this.composerVersion++; this.app.patch({ ai: emptyAi() }); }
  invalidate(key = "") {
    this.version++; this.set({ busy: false, result: null, source: null, message: key ? { key } : null });
  }
  changeLanguage() {
    if (this.state.message?.error && !this.state.busy && !this.state.result) return;
    this.invalidate(this.state.result || this.state.busy ? "aiStale" : "");
  }
  changeSource() { if (this.state.busy || this.state.result) this.invalidate("aiStale"); }
  clear() { this.invalidate(); this.composerVersion++; this.set({ record: "", recordTitle: "", text: "", bubbles: [] }); }
  toggle = () => this.set({ open: !this.state.open });
  close = () => this.set({ open: false });
  changeText(text: string) { this.composerVersion++; this.set({ text }); }
  private bubble(role: "user" | "assistant", text: string) {
    this.set({ bubbles: [...this.state.bubbles, { id: ++this.bubbleId, role, text }].slice(-10) });
  }
  importDraft = () => {
    if (this.state.busy || this.app.getSnapshot().entrySending) return;
    if ((this.state.record || this.state.text.trim()) && !confirm(this.app.t("aiReplaceChat"))) return;
    this.clear(); const { title, description } = this.app.getSnapshot().entry;
    this.set({ recordTitle: title, text: description, message: { key: "aiImported" } });
  };
  clearWithConfirmation = () => {
    if ((this.state.record || this.state.text.trim()) && !confirm(this.app.t("aiClearConfirm"))) return;
    this.clear();
  };
  needsText = () => Boolean(this.state.source && this.state.source.description !== this.app.getSnapshot().entry.description);
  canApply = () => Boolean(this.state.result && !this.state.busy && !this.app.getSnapshot().entrySending && !this.state.text.trim() && (!this.needsText() || this.state.selections.text));
  selection(key: keyof AiState["selections"], selected: boolean) { this.set({ selections: { ...this.state.selections, [key]: selected } }); }
  async load() {
    const version = ++this.statusVersion;
    try {
      const data = await this.app.read<{ enabled: boolean }>("/ai/status");
      if (version === this.statusVersion) this.set({ enabled: data.enabled === true });
    } catch { if (version === this.statusVersion) this.set({ enabled: false }); }
    finally { if (version === this.statusVersion) this.set({ available: true }); }
  }
  async send() {
    const { busy, enabled, record, recordTitle } = this.state;
    if (busy || !enabled || this.app.getSnapshot().entrySending) return;
    const text = this.state.text.trim();
    if (!text && !record) return this.set({ message: { key: "aiNeedMessage", error: true } });
    const description = record && text ? record + "\n" + text : record || text;
    if (description.length > 4000) return this.set({ message: { key: "aiChatLimit", error: true } });
    this.invalidate();
    const version = ++this.version, snapshot = this.draft(), composer = this.composerVersion;
    this.set({ busy: true }); if (text) this.bubble("user", text);
    try {
      const { analysis } = await this.app.json<{ analysis: Analysis }>("/ai/analyze", "POST", { title: recordTitle, description, language: snapshot.language });
      if (version !== this.version || JSON.stringify(snapshot) !== JSON.stringify(this.draft())) return;
      this.set({ result: analysis, source: { draft: snapshot, description, title: recordTitle }, record: description,
        ...(composer === this.composerVersion && this.state.text.trim() === text ? { text: "" } : {}),
        message: { key: "aiReview" },
        selections: { text: description !== this.app.getSnapshot().entry.description, unit: analysis.equipment !== "UNKNOWN", kind: true, priority: analysis.priority !== "UNKNOWN" } });
      this.bubble("assistant", analysis.rationale);
    } catch (error) {
      if (version === this.version && !isAbort(error)) this.set({ message: { key: error instanceof ApiError ? errorKeys[error.code] || "aiFailed" : "aiFailed", error: true } });
    } finally { if (version === this.version) this.set({ busy: false }); }
  }
  apply = () => {
    const { result, source, selections } = this.state;
    if (!result || !source || !this.canApply()) return;
    if (JSON.stringify(source.draft) !== JSON.stringify(this.draft())) return this.invalidate("aiStale");
    const patch: Partial<AppStore["state"]["entry"]> = {};
    if (this.needsText()) {
      patch.description = source.description;
      patch.title = source.title || (source.description.split(/[\n.!?]/)[0]?.trim() || source.description).slice(0, 160);
    }
    if (selections.unit && result.equipment !== "UNKNOWN") patch.equipmentCode = result.equipment === "GENERAL" ? "" : result.equipment;
    if (selections.kind) patch.kind = result.kind;
    if (selections.priority && result.priority !== "UNKNOWN") patch.priority = result.priority;
    this.app.changeEntry(patch);
    this.invalidate("aiApplied"); this.app.go("new-record");
  };
}
