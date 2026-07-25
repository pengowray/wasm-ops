/**
 * Colour theme.
 *
 * The stylesheet follows the operating system by default. The toggle writes an
 * explicit override to `data-theme` on the root element and remembers it; the
 * inline bootstrap script in the page head reapplies it before first paint, so
 * there is no flash of the wrong theme on load.
 */

type Theme = 'light' | 'dark';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function current(): Theme {
  const override = document.documentElement.dataset['theme'];
  return override === 'light' || override === 'dark' ? override : systemTheme();
}

export function initTheme(button: HTMLElement): void {
  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private browsing or blocked storage: the choice just will not persist.
    }
  });
}
