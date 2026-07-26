import { MoonStar, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const syncWithDevice = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
    systemTheme.addEventListener("change", syncWithDevice);
    return () => systemTheme.removeEventListener("change", syncWithDevice);
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={dark ? "Modo claro" : "Modo escuro"}
      aria-pressed={dark}
    >
      {dark ? <Sun size={21} /> : <MoonStar size={21} />}
    </button>
  );
}
