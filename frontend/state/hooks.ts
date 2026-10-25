import { useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { app } from "./store";
import type { AppState } from "./types";
import { translate } from "../lib/i18n";
export function useApp<T>(select: (state: AppState) => T): T {
  return useSyncExternalStore(app.subscribe, () => select(app.getSnapshot()));
}
export function useT() {
  const language = useApp(state => state.language);
  return useCallback((key: string, vars: Record<string, string | number> = {}) => translate(language, key, vars), [language]);
}
export function useApplicationEffects() {
  const language = useApp(state => state.language), theme = useApp(state => state.theme);
  useLayoutEffect(() => {
    document.documentElement.lang = language; document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111827" : "#dfe3e9");
  }, [language, theme]);
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    const media = (event: MediaQueryListEvent) => app.systemTheme(event.matches);
    const storage = (event: StorageEvent) => { if (event.key === "vardiya-theme" || event.key === null) app.storageTheme(event.newValue); };
    const hash = () => app.navigate(location.hash);
    const visibility = () => { if (document.visibilityState === "visible") void app.refreshLive(); };
    const unload = (event: BeforeUnloadEvent) => { if (app.dirty()) { event.preventDefault(); event.returnValue = ""; } };
    const online = () => app.online(true), offline = () => app.online(false);
    const interval = setInterval(() => { void app.refreshLive(); }, 30000);
    system.addEventListener("change", media); window.addEventListener("storage", storage); window.addEventListener("hashchange", hash);
    window.addEventListener("beforeunload", unload); window.addEventListener("online", online); window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(interval); system.removeEventListener("change", media); window.removeEventListener("storage", storage); window.removeEventListener("hashchange", hash);
      window.removeEventListener("beforeunload", unload); window.removeEventListener("online", online); window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
}
export function useMobileViewport() {
  useEffect(() => {
    const root = document.documentElement, viewport = window.visualViewport;
    const mobile = matchMedia("(max-width:700px), (max-width:1000px) and (max-height:500px)");
    let frame = 0, baselineHeight = innerHeight, baselineWidth = innerWidth, previousHeight = 0;
    function update() {
      frame = 0;
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      const height = viewport?.height || innerHeight, top = Math.max(0, viewport?.offsetTop || 0), active = document.activeElement;
      const editing = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement && ["text", "email", "password", "search", "tel", "url", "number"].includes(active.type);
      if (innerWidth !== baselineWidth || !editing) { baselineWidth = innerWidth; baselineHeight = innerHeight; }
      const keyboard = mobile.matches && editing && Math.max(baselineHeight, innerHeight, root.clientHeight) - height > 120;
      const wasOpen = root.classList.contains("keyboard-open"); root.classList.toggle("keyboard-open", keyboard);
      root.style.setProperty("--visible-viewport-height", height + "px"); root.style.setProperty("--visible-viewport-top", top + "px");
      if (keyboard && (!wasOpen || height < previousHeight) && active instanceof HTMLElement && active.closest('dialog[open], #ai-chat:not([hidden])')) {
        requestAnimationFrame(() => { if (active === document.activeElement) active.scrollIntoView({ block: "nearest", inline: "nearest" }); });
      }
      previousHeight = height;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    viewport?.addEventListener("resize", schedule); viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule); window.addEventListener("orientationchange", schedule);
    document.addEventListener("focusin", schedule); document.addEventListener("focusout", schedule);
    mobile.addEventListener("change", schedule); update();
    return () => {
      cancelAnimationFrame(frame); viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule); window.removeEventListener("orientationchange", schedule);
      document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule); mobile.removeEventListener("change", schedule);
      root.classList.remove("keyboard-open"); root.style.removeProperty("--visible-viewport-height"); root.style.removeProperty("--visible-viewport-top");
    };
  }, []);
}
