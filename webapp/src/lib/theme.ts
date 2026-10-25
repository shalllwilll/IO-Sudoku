export type Theme = 'dark' | 'light'

export const getTheme = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'

/** Swap themes with every transition disabled for one frame, then restored. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.add('theme-switching')
  root.dataset.theme = theme
  void root.offsetHeight // flush styles while transitions are off
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* storage can be blocked; the theme still applies for this session */
  }
}
