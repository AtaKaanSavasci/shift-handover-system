import type { AppState, AiState, NotesState, WorkState, EntryDraft, PageResult } from "./types";
import { currentSchedule } from "../lib/format";
export const emptyPage = <T>(): PageResult<T> => ({ items: [], total: 0, page: 1, pageSize: 20 });
export const emptyEntry = (): EntryDraft => ({ kind: "EVENT", priority: "NORMAL", equipmentCode: "", title: "", description: "", workStatus: "OPEN", responsibleTeam: "", nextStep: "" });
export const emptyNotes = (): NotesState => ({ active: null, data: null, text: "", hasDraft: false, loading: false, busy: false, message: null });
export const emptyWork = (): WorkState => ({ active: null, data: null, fields: { workStatus: "OPEN", responsibleTeam: "", nextStep: "" }, hasDraft: false, loading: false, busy: false, message: null });
export const emptyAi = (): AiState => ({ open: false, enabled: false, available: false, busy: false, result: null, message: null, record: "", recordTitle: "", text: "", bubbles: [], source: null, selections: { text: false, unit: true, kind: true, priority: true } });
export function defaults(): AppState {
  return {
    language: "tr", theme: "light", themePreference: null, user: null, page: "overview", navigationVersion: 0,
    authBusy: false, authMessage: null, authReset: 0, dashboardMessage: null,
    current: undefined, currentStale: false, schedule: currentSchedule(), shiftBusy: false,
    summary: null, summaryStale: false, checkedAt: null, summaryBusy: false,
    board: emptyPage(), boardFilters: "", boardFilterDraft: { kind: "", equipment: "", priority: "" },
    operations: emptyPage(), operationFilters: "", operationFilterDraft: { q: "", kind: "", equipment: "", status: "", from: "", to: "" }, operationsBusy: false,
    shifts: emptyPage(), shiftFilters: "", shiftFilterDraft: { from: "", to: "", scope: "own" }, shiftsLoading: false, shiftsFailed: false, exporting: false,
    entry: emptyEntry(), photos: [], entrySending: false, entryMessage: null, entryReset: 0, entryFocus: 0,
    equipmentDialog: null, closeDialog: null, observation: null, photoUrl: null,
    notes: emptyNotes(), work: emptyWork(), ai: emptyAi(), connection: { browserOnline: navigator.onLine, reachable: null, failures: [], lastResponse: null, busy: false }
  };
}
