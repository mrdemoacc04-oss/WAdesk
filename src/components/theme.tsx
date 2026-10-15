"use client";
import * as React from "react";

type Theme = "light" | "dark" | "system";
const KEY = "wadesk-theme";

const Ctx = React.createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "light",
  resolved: "light",
  setTheme: () => {},
});

export const useTheme = () => React.useContext(Ctx);

/** Inlined in <head> so the right theme paints on the first frame. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'light';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})()`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("light");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  const apply = React.useCallback((t: Theme) => {
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    setResolved(dark ? "dark" : "light");
  }, []);

  React.useEffect(() => {
    let t: Theme = "light";
    try {
      t = (localStorage.getItem(KEY) as Theme) || "light";
    } catch {}
    setThemeState(t);
    apply(t);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => theme === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply]);

  const setTheme = React.useCallback(
    (t: Theme) => {
      setThemeState(t);
      try {
        localStorage.setItem(KEY, t);
      } catch {}
      // brief cross-fade instead of a hard flip
      const root = document.documentElement;
      root.style.transition = "background-color .35s var(--ease-fluid), color .35s var(--ease-fluid)";
      apply(t);
      setTimeout(() => (root.style.transition = ""), 400);
    },
    [apply],
  );

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
