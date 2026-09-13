export interface Item { id: string; name: string; type: string; folder: boolean; seconds: number; resume: number; played: boolean; year?: number }
export interface Page { items: Item[]; total: number; offset: number }
export const PAGE_SIZE = 5;
export function time(seconds: number) { const s=Math.max(0,Math.floor(seconds||0)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
