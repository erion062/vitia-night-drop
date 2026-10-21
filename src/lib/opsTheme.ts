import { useEffect } from 'react';

/** Admin / partner panels keep the dark night-ops look. */
export function useOpsTheme() {
  useEffect(() => {
    document.documentElement.classList.add('ops');
    document.body.classList.add('ops');
    const color = document.querySelector('meta[name="theme-color"]');
    const scheme = document.querySelector('meta[name="color-scheme"]');
    const prevColor = color?.getAttribute('content') || '';
    const prevScheme = scheme?.getAttribute('content') || '';
    color?.setAttribute('content', '#121212');
    scheme?.setAttribute('content', 'dark');
    return () => {
      document.documentElement.classList.remove('ops');
      document.body.classList.remove('ops');
      if (color) color.setAttribute('content', prevColor || '#FFFFFF');
      if (scheme) scheme.setAttribute('content', prevScheme || 'light');
    };
  }, []);
}
