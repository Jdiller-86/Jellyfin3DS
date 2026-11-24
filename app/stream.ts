export function clampPosition(seconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0));
}

export function seekAtX(x: number, duration: number): number {
  return clampPosition((x - 16) / 288 * duration, duration);
}

export function progressWidth(seconds: number, duration: number): number {
  return duration > 0 ? Math.round(288 * clampPosition(seconds, duration) / duration) : 0;
}
