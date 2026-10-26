// Apply the saved/system theme before styles and the larger React bundle paint.
// Preference events and controls are owned by React after mounting.
(() => {
  let preference = null;
  try {
    const saved = localStorage.getItem("vardiya-theme");
    if (saved === "dark" || saved === "light") preference = saved;
  } catch { /* Storage can be unavailable. */ }
  const theme = preference || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111827" : "#dfe3e9");
})();
