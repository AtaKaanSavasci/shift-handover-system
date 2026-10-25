import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { app } from "./state/store";
import "./styles.css";

// Apply preferences before the first React frame, including storage-disabled mode.
document.documentElement.dataset.theme = app.getSnapshot().theme;
document.documentElement.lang = app.getSnapshot().language;
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
