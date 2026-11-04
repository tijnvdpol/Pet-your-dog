/** Short vibration where supported (not on iOS Safari; silently ignored there). */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // ignore
  }
}
