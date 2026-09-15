"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = 'system' | 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; change: (theme: Theme) => void }>({ theme: 'system', change: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server and first client render always use system. CSS resolves the media query.
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('unreleased-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        // This deliberately hydrates browser persistence only after the initial render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTheme(saved);
      }
    } catch { /* A blocked storage API should not break rendering. */ }
  }, []);
  function change(value: Theme) {
    setTheme(value);
    try { localStorage.setItem('unreleased-theme', value); } catch { /* Optional persistence. */ }
  }
  return <ThemeContext.Provider value={{ theme, change }}><div className="theme-scope" data-theme={theme}>{children}</div></ThemeContext.Provider>;
}

export function ThemeSwitch() {
  const { theme, change } = useContext(ThemeContext);
  return <label className="theme-switch">Theme<select aria-label="Theme" value={theme} onChange={(event) => change(event.target.value as Theme)}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>;
}
