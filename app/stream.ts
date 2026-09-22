export function clampPosition(seconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(duration, Number.isFinite(seconds) ? seconds : 0));
}

export function seekAtX(x: number, duration: number): number {
  return clampPosition((x - 24) / 272 * duration, duration);
}

export function progressWidth(seconds: number, duration: number): number {
  return duration > 0 ? Math.round(272 * clampPosition(seconds, duration) / duration) : 0;
}
