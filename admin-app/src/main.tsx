import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./mobile.css";
import "./light-refresh.css";

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const applySystemTheme = (dark: boolean) => {
  const theme = dark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};

applySystemTheme(systemTheme.matches);
systemTheme.addEventListener("change", event => applySystemTheme(event.matches));

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
