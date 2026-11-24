import { For, Show } from "solid-js";
import { View, Text } from "@pocketjs/framework/components";
import { type Item, type Page, type Quality, type StreamProfile, time } from "./protocol.ts";
import { progressWidth } from "./stream.ts";
import { UI } from "./ui.ts";

export function label(value: string, max = 40) {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function phaseLabel(phase: string): string {
  if (!phase) return "Opening";
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function SetupView(props: {
  setupField: number;
  server: string;
  username: string;
  passwordLabel: string;
  authenticated: boolean;
  providerReady: boolean;
}) {
  return (
    <>
      <View class="absolute left-0 top-0 w-full h-[32] items-center justify-center bg-[#151b26] border border-[#283246]">
        <Text class="text-sm text-[#f1f5f9] font-bold">Account · v0.3.5</Text>
        <View class="absolute left-0 right-0 bottom-0 h-[2] bg-[#a855f7]" />
      </View>
      <View class={props.setupField === 0 ? "absolute left-[8] right-[8] top-[43] h-[39] bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[8] right-[8] top-[43] h-[39] bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#94a3b8]">Server URL</Text>
        <Show when={props.server.startsWith("https://") || props.server.startsWith("http://")}>
          <Text class={props.server.startsWith("https://") ? "absolute right-[8] top-[4] text-xs text-[#86efac] font-bold" : "absolute right-[8] top-[4] text-xs text-[#fcd34d] font-bold"}>
            {props.server.startsWith("https://") ? "HTTPS" : "HTTP"}
          </Text>
        </Show>
        <Text class="absolute left-[8] top-[19] text-xs text-[#f1f5f9]">{label(props.server)}</Text>
      </View>
      <View class={props.setupField === 1 ? "absolute left-[8] right-[8] top-[86] h-[39] bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[8] right-[8] top-[86] h-[39] bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#94a3b8]">Username</Text>
        <Text class="absolute left-[8] top-[19] text-xs text-[#f1f5f9]">{props.username || "Enter username"}</Text>
      </View>
      <View class={props.setupField === 2 ? "absolute left-[8] right-[8] top-[129] h-[39] bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[8] right-[8] top-[129] h-[39] bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#94a3b8]">Password</Text>
        <Text class="absolute left-[8] top-[19] text-xs text-[#f1f5f9]">{props.passwordLabel}</Text>
      </View>
      <View class={props.authenticated
        ? `absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center ${props.setupField === 3 ? UI.btnPrimaryFocused : UI.btnPrimary}`
        : `absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center ${props.setupField === 3 ? UI.btnPrimaryFocused : UI.btnPrimary}`}>
        <Text class="text-sm text-[#f1f5f9] font-bold">Sign in [A]</Text>
      </View>
      <Show when={props.authenticated}>
        <View class={props.setupField === 4 ? "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-[#521d26] border-2 border-[#f87171] rounded-lg" : "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-[#3b161c] border border-[#ef4444] rounded-lg"}>
          <Text class="text-sm text-[#fecaca] font-bold">Sign out</Text>
        </View>
      </Show>
      <Text class="absolute left-[8] top-[222] text-xs text-[#94a3b8]">
        {props.authenticated ? "A: Edit/Confirm · B: Back" : props.providerReady ? "A: Edit · START: Submit" : "Starting…"}
      </Text>
    </>
  );
}

export function NavBar(props: { mode: string; inSetup?: boolean }) {
  const tab = (active: boolean, labelText: string) => (
    <View class="w-[80] h-full items-center justify-center relative">
      <Text class={active ? `text-xs ${UI.textAccent} font-bold` : `text-xs ${UI.textSecondary} font-bold`}>{labelText}</Text>
      <Show when={active}>
        <View class="absolute left-[10] right-[10] bottom-0 h-[2] bg-[#c084fc]" />
      </Show>
    </View>
  );
  return (
    <View class="absolute left-0 top-0 w-full h-[32] flex-row items-center bg-[#151b26] border border-[#283246]">
      {tab(!props.inSetup && (props.mode === "libraries" || props.mode === "folder"), "Libraries")}
      {tab(!props.inSetup && props.mode === "resume", "Continue")}
      {tab(!props.inSetup && props.mode === "search", "Search")}
      {tab(Boolean(props.inSetup), "Account")}
    </View>
  );
}

export function BrowserListView(props: {
  title: string;
  page: Page;
  index: number;
  scrollY: number;
  rowHeight: number;
  visibleRows: Item[];
  busy: boolean;
  mode: string;
  fetchingMore: boolean;
  playing: boolean;
}) {
  const thumbTop = () => Math.min(176, Math.max(48, 48 + 128 * (props.page.offset + props.index) / Math.max(1, props.page.total - 1)));
  const firstRow = () => Math.floor(props.scrollY / props.rowHeight);
  return (
    <>
      <Text class="absolute left-[8] top-[34] text-xs text-[#94a3b8]">{label(props.title, 34)}</Text>
      <Show when={props.page.total > 0}>
        <Text class="absolute right-[8] top-[34] text-xs text-[#d8b4fe]">{props.page.offset + props.index + 1}/{props.page.total}</Text>
      </Show>
      <View class="absolute right-[1] top-[48] w-[3] h-[140] bg-[#1e2636]" />
      <View class="absolute right-[1] w-[3] h-[12] bg-[#a855f7]" style={{ insetT: thumbTop() }} />
      <View class="absolute left-0 right-[4] top-[48] h-[140] overflow-hidden">
        <For each={props.visibleRows}>{(item, i) => {
          const rowIdx = () => firstRow() + i();
          return (
            <View style={{ insetT: rowIdx() * props.rowHeight - props.scrollY }} class={rowIdx() === props.index ? "absolute left-[6] right-[6] h-[27] overflow-hidden bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[6] right-[6] h-[27] overflow-hidden bg-[#161d2b] border border-[#253044] rounded-lg"}>
              <Text class="absolute left-[6] top-[5] text-xs text-[#f1f5f9]">{item.folder ? "▸ " : item.played ? "✓ " : "  "}{label(item.name, 36)}</Text>
              <Show when={item.resume > 0 && item.seconds > 0}>
                <View class="absolute left-[4] bottom-0 h-[2] bg-[#a855f7]" style={{ width: Math.min(288, 288 * item.resume / item.seconds) }} />
              </Show>
            </View>
          );
        }}</For>
      </View>
      <Show when={!props.page.items.length}>
        <Text class="absolute left-[16] top-[91] text-sm text-[#94a3b8]">{props.busy ? "Loading…" : props.mode === "search" ? "No results" : "No items"}</Text>
      </Show>
      <Show when={props.fetchingMore}>
        <View class="absolute left-[120] top-[168] w-[80] h-[20] items-center justify-center bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg">
          <Text class="text-xs text-[#d8b4fe]">Loading…</Text>
        </View>
      </Show>
      <View class={props.playing ? "absolute left-[6] right-[6] top-[192] h-[28] flex-row justify-around items-center bg-[#4c2473] border border-[#a855f7] rounded-lg" : "absolute left-[6] right-[6] top-[192] h-[28] flex-row justify-around items-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
        <Text class="text-xs text-[#cbd5e1]">Back [B]</Text>
        <View class="w-[1] h-[16] bg-[#2e3a52]" />
        <Text class={props.playing ? "text-xs text-[#d8b4fe] font-bold" : "text-xs text-[#94a3b8]"}>
          {props.playing ? "Now playing [SELECT]" : `${props.page.total} items · X: Search`}
        </Text>
      </View>
    </>
  );
}

export function DetailView(props: {
  item: Item;
  detailFocus: number;
  overview: string;
  playing: boolean;
}) {
  return (
    <>
      <Text class="absolute left-[10] top-[40] text-sm text-[#f1f5f9] font-bold">{label(props.item.name, 34)}</Text>
      <Text class="absolute left-[10] top-[57] text-xs text-[#94a3b8]">
        {props.item.seconds > 0 ? `${Math.round(props.item.seconds / 60)} min` : props.item.type}{props.item.year ? ` · ${props.item.year}` : ""}
      </Text>
      <View class={props.detailFocus === 0 ? "absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg" : "absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-[#4c2473] border border-[#a855f7] rounded-lg"}>
        <Text class="text-sm text-[#f1f5f9] font-bold">{props.item.resume ? `Resume ${time(props.item.resume)} [A]` : "Play [A]"}</Text>
      </View>
      <Show when={props.item.resume > 0}>
        <View class={props.detailFocus === 1 ? "absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9]">Start over</Text>
        </View>
      </Show>
      <Show when={!props.item.resume}>
        <Text class="absolute left-[12] right-[12] top-[124] text-xs text-[#cbd5e1]">{props.overview.slice(0, 145)}</Text>
      </Show>
      <Show when={!props.playing}>
        <View class={props.detailFocus === 2 ? "absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9]">Back [B]</Text>
        </View>
      </Show>
      <Show when={props.playing}>
        <View class={props.detailFocus === 2 ? "absolute left-[10] w-[146] top-[170] h-[40] items-center justify-center bg-[#2c1f42] border-2 border-[#c084fc] rounded-lg" : "absolute left-[10] w-[146] top-[170] h-[40] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9]">Back [B]</Text>
        </View>
        <View class={props.detailFocus === 3 ? "absolute right-[10] w-[146] top-[170] h-[40] items-center justify-center bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg" : "absolute right-[10] w-[146] top-[170] h-[40] items-center justify-center bg-[#4c2473] border border-[#a855f7] rounded-lg"}>
          <Text class="text-sm text-[#d8b4fe] font-bold">Now playing</Text>
        </View>
      </Show>
    </>
  );
}

export function PlayerControlsView(props: {
  streamInfo: boolean;
  title: string;
  phase: string;
  videoSize: string;
  displayFps?: number;
  decodeFps?: number;
  profile?: StreamProfile;
  playbackSeconds: number;
  durationSeconds: number;
  seeking?: boolean;
  infoFocus: number;
  quality: Quality;
  hardwareDecode: boolean;
  newModel: boolean;
  volume: number;
  hasNext?: boolean;
}) {
  const primaryLabel = () => props.phase === "ended" ? (props.hasNext ? "Next" : "Replay") : props.phase === "paused" ? "Play" : "Pause";
  const progress = () => progressWidth(props.playbackSeconds, props.durationSeconds);
  return (
    <>
      <Show when={!props.streamInfo}>
        <View class="absolute left-0 top-0 w-full h-[36] px-[10] flex-row items-center justify-between bg-[#151b26] border border-[#283246]">
          <Text class="text-xs text-[#f1f5f9] font-bold">{label(props.title, 22)}</Text>
          <Text class="text-xs text-[#d8b4fe] font-bold">
            {phaseLabel(props.phase)}{props.displayFps ? ` · ${props.displayFps.toFixed(1)} fps` : ""} · {props.profile?.hardware ? "MVD" : "CPU"}
          </Text>
        </View>

        <Text class={props.seeking ? "absolute left-[16] top-[46] text-xs font-bold text-[#38bdf8]" : "absolute left-[16] top-[46] text-xs font-bold text-[#f1f5f9]"}>{time(props.playbackSeconds)}</Text>
        <Text class="absolute right-[16] top-[46] text-xs text-[#94a3b8]">{time(props.durationSeconds)}</Text>
        <View class="absolute left-[16] top-[72] w-[288] h-[8] rounded-lg bg-[#1e2636]" />
        <View class="absolute left-[16] top-[72] h-[8] rounded-lg bg-[#a855f7]" style={{ width: progress() }} />
        <View class="absolute top-[67] w-[18] h-[18] rounded-lg bg-[#f1f5f9] border-2 border-[#a855f7]" style={{ insetL: Math.min(294, 8 + progress()) }} />

        <View class="absolute left-[8] top-[98] w-[58] h-[46] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#cbd5e1] font-bold">−30s</Text></View>
        <View class="absolute left-[70] top-[98] w-[54] h-[46] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#f1f5f9] font-bold">−10s</Text></View>
        <View class="absolute left-[128] top-[98] w-[64] h-[46] items-center justify-center bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg"><Text class="text-sm text-[#f1f5f9] font-bold">{primaryLabel()}</Text></View>
        <View class="absolute left-[196] top-[98] w-[54] h-[46] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#f1f5f9] font-bold">+10s</Text></View>
        <View class="absolute left-[254] top-[98] w-[58] h-[46] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#cbd5e1] font-bold">+30s</Text></View>

        <View class="absolute left-[8] right-[8] top-[150] h-[28] flex-row justify-around items-center overflow-hidden bg-[#1a2232] border border-[#2e3a52] rounded-lg">
          <Text class="text-sm text-[#cbd5e1] font-bold">−</Text>
          <Text class="text-xs text-[#d8b4fe] font-bold">Volume {Math.round(props.volume * 100)}%</Text>
          <Text class="text-sm text-[#cbd5e1] font-bold">+</Text>
          <View class="absolute left-[6] bottom-0 h-[2] bg-[#a855f7]" style={{ width: Math.round(292 * props.volume) }} />
        </View>

        <View class="absolute left-[8] top-[184] w-[98] h-[34] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#f1f5f9] font-bold">Stream [X]</Text></View>
        <View class="absolute left-[111] top-[184] w-[98] h-[34] items-center justify-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"><Text class="text-xs text-[#f1f5f9] font-bold">Browse [B]</Text></View>
        <View class="absolute left-[214] top-[184] w-[98] h-[34] items-center justify-center bg-[#3b161c] border border-[#ef4444] rounded-lg"><Text class="text-xs text-[#fecaca] font-bold">Stop</Text></View>
      </Show>

      <Show when={props.streamInfo}>
        <View class="absolute left-0 top-0 w-full h-[32] px-[12] flex-row items-center justify-between bg-[#151b26] border border-[#283246]">
          <Text class="text-sm text-[#f1f5f9] font-bold">Stream / Decoder</Text>
          <Text class="text-xs text-[#d8b4fe] font-bold">Back [B]</Text>
        </View>
        <View class="absolute left-[8] right-[8] top-[40] h-[54] px-[10] justify-center rounded-xl bg-[#161c28] border border-[#2a3448]">
          <Text class="text-xs text-[#d8b4fe] font-bold">
            Video {props.videoSize} · {props.displayFps ? `${props.displayFps.toFixed(1)} fps` : "measuring…"}
            {props.decodeFps ? ` (dec ${props.decodeFps.toFixed(1)})` : ""}
          </Text>
          <Text class="text-xs text-[#cbd5e1]">
            Cap {props.profile?.maxWidth ?? 256}×{props.profile?.maxHeight ?? 144} · {props.profile?.maxFps ?? 12} fps · ≤{props.profile?.videoKbps ?? 192} kb/s
          </Text>
        </View>
        <View class={props.infoFocus === 0 ? "absolute left-[8] right-[8] top-[102] h-[36] px-[12] flex-row justify-between items-center bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg" : "absolute left-[8] right-[8] top-[102] h-[36] px-[12] flex-row justify-between items-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9]">Quality</Text>
          <Text class="text-sm text-[#d8b4fe] font-bold">{props.quality === "native" ? "Native" : props.quality === "high" ? "High" : "Standard"} ›</Text>
        </View>
        <View class={props.infoFocus === 1 ? "absolute left-[8] right-[8] top-[144] h-[36] px-[12] flex-row justify-between items-center bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg" : "absolute left-[8] right-[8] top-[144] h-[36] px-[12] flex-row justify-between items-center bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9]">Decoder</Text>
          <Text class="text-sm text-[#d8b4fe] font-bold">{props.newModel ? (props.hardwareDecode ? "MVD Hardware ›" : "CPU Software ›") : "CPU (Old 3DS)"}</Text>
        </View>
        <View class={props.infoFocus === 2 ? "absolute left-[8] right-[8] top-[186] h-[30] flex-row justify-around items-center overflow-hidden bg-[#5f2d8f] border-2 border-[#d8b4fe] rounded-lg" : "absolute left-[8] right-[8] top-[186] h-[30] flex-row justify-around items-center overflow-hidden bg-[#1a2232] border border-[#2e3a52] rounded-lg"}>
          <Text class="text-sm text-[#f1f5f9] font-bold">−</Text>
          <Text class="text-sm text-[#d8b4fe] font-bold">Volume {Math.round(props.volume * 100)}%</Text>
          <Text class="text-sm text-[#f1f5f9] font-bold">+</Text>
          <View class="absolute left-[6] bottom-0 h-[2] bg-[#a855f7]" style={{ width: Math.round(292 * props.volume) }} />
        </View>
      </Show>
    </>
  );
}
