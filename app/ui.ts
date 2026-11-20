export const ROW_HEIGHT = 28;
export const LIST_HEIGHT = 140;

export function clampScroll(value: number, itemCount: number): number {
  const max = Math.max(0, itemCount * ROW_HEIGHT - LIST_HEIGHT);
  return Math.max(0, Math.min(max, value));
}

export function hitTestSetup(x: number, y: number, authenticated: boolean): number {
  if (y >= 43 && y < 82) return 0;
  if (y >= 86 && y < 125) return 1;
  if (y >= 129 && y < 168) return 2;
  if (y >= 176 && y < 216) return authenticated && x >= 160 ? 4 : 3;
  return -1;
}

export function hitTestNav(x: number): "libraries" | "resume" | "search" | "setup" {
  if (x < 80) return "libraries";
  if (x < 160) return "resume";
  if (x < 240) return "search";
  return "setup";
}

export function hitTestDetail(x: number, y: number, hasResume: boolean, isPlaying: boolean):
  "resume" | "restart" | "back" | "nowPlaying" | null {
  if (y >= 76 && y < 116) return "resume";
  if (y >= 122 && y < 162 && hasResume) return "restart";
  if (y >= 170 && y < 213) return isPlaying && x >= 160 ? "nowPlaying" : "back";
  return null;
}

export function hitTestControls(x: number, y: number, streamInfo: boolean):
  "quality" | "volDown" | "volUp" | "seekBack" | "pause" | "seekFwd" | "stream" | "browse" | "stop" | null {
  if (streamInfo) {
    if (y >= 150 && y < 186) return "quality";
    if (y >= 190 && y < 220) return x < 160 ? "volDown" : "volUp";
    return null;
  }
  if (y >= 125 && y < 170) return x < 106 ? "seekBack" : x < 216 ? "pause" : "seekFwd";
  if (y >= 174 && y < 220) return x < 109 ? "stream" : x < 212 ? "browse" : "stop";
  return null;
}
