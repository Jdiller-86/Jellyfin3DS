export const ROW_HEIGHT = 28;
export const LIST_HEIGHT = 140;

/* High-contrast dark-cinema Jellyfin tokens (all >= 4.5:1 WCAG AA). */
export const UI = {
  canvas: "bg-[#0f131b]",
  playerCanvas: "bg-[#0b0e14]",
  headerBar: "bg-[#151b26] border border-[#283246]",
  card: "rounded-xl bg-[#161c28] border border-[#2a3448]",
  textPrimary: "text-[#f1f5f9]",
  textSecondary: "text-[#cbd5e1]",
  textMuted: "text-[#94a3b8]",
  textAccent: "text-[#d8b4fe]",
  textCyan: "text-[#38bdf8]",
  btnDefault: "bg-[#1a2232] border border-[#2e3a52] rounded-lg",
  btnFocused: "bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg",
  btnPrimary: "bg-[#4c2473] border border-[#a855f7] rounded-lg",
  btnPrimaryFocused: "bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg",
  btnDanger: "bg-[#3b161c] border border-[#ef4444] rounded-lg",
  btnDangerFocused: "bg-[#521d26] border-2 border-[#f87171] rounded-lg",
  rowDefault: "bg-[#161d2b] border border-[#253044] rounded-lg",
  rowFocused: "bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg",
} as const;

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
  "quality" | "decoder" | "volDown" | "volUp" | "closeStream" | "seekBack30" | "seekBack" | "pause" | "seekFwd" | "seekFwd30" | "stream" | "browse" | "stop" | null {
  if (streamInfo) {
    if (y < 36 && x >= 230) return "closeStream";
    if (y >= 102 && y < 138) return "quality";
    if (y >= 144 && y < 180) return "decoder";
    if (y >= 186 && y < 216) return x < 160 ? "volDown" : "volUp";
    return null;
  }
  if (y >= 98 && y < 144) {
    if (x < 68) return "seekBack30";
    if (x < 126) return "seekBack";
    if (x < 194) return "pause";
    if (x < 252) return "seekFwd";
    return "seekFwd30";
  }
  if (y >= 150 && y < 178) return x < 160 ? "volDown" : "volUp";
  if (y >= 184 && y < 218) return x < 110 ? "stream" : x < 210 ? "browse" : "stop";
  return null;
}
