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
export interface Metadata { overview?: string; series?: string; rating?: string; genre?: string; season?: number; episode?: number; artId?: string }
export interface Page { items: Item[]; total: number; offset: number }
export interface Hello {
  direct: true;
  authenticated: boolean;
  persisted?: boolean;
  newModel: boolean;
  server: string;
  username: string;
}
export interface DirectMediaStatus {
  videoWidth?: number;
  videoHeight?: number;
  displayFps?: number;
  decodeFps?: number;
}
export type Quality = "standard" | "high" | "native";
export interface StreamProfile {
  quality: Quality;
  videoKbps: number;
  audioKbps: number;
  maxWidth: number;
  maxHeight: number;
  maxFps: number;
  hardware: boolean;
}
export const PAGE_SIZE = 5;
export function time(seconds: number) { const s=Math.max(0,Math.floor(seconds||0)); return s>=3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}` : `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
