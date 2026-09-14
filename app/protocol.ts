export interface Item {
  id: string;
  name: string;
  type: string;
  folder: boolean;
  seconds: number;
  resume: number;
  played: boolean;
  year?: number;
  artId?: string;
}
export interface Page { items: Item[]; total: number; offset: number }
export interface Hello {
  direct: true;
  authenticated: boolean;
  persisted?: boolean;
  server: string;
  username: string;
}
export interface DirectMediaStatus {
  videoWidth?: number;
  videoHeight?: number;
}
export const PAGE_SIZE = 5;
export function time(seconds: number) { const s=Math.max(0,Math.floor(seconds||0)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
