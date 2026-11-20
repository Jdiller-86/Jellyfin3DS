import { For, Show } from "solid-js";
import { View, Text } from "@pocketjs/framework/components";
import { type Item, type Page, type Quality, type StreamProfile, time } from "./protocol.ts";
import { progressWidth } from "./stream.ts";

export function label(value: string) {
  return value.length > 40 ? `${value.slice(0, 37)}...` : value;
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
      <View class="absolute left-0 top-0 w-full h-[32] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]">
        <Text class="text-sm text-[#3c4954] font-bold">Account · v0.3.4</Text>
      </View>
      <View class={props.setupField === 0 ? "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Server URL</Text>
        <Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{label(props.server)}</Text>
      </View>
      <View class={props.setupField === 1 ? "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Username</Text>
        <Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{props.username || "Enter username"}</Text>
      </View>
      <View class={props.setupField === 2 ? "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
        <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Password</Text>
        <Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{props.passwordLabel}</Text>
      </View>
      <View class={props.authenticated
        ? props.setupField === 3
          ? "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg"
          : "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"
        : props.setupField === 3
          ? "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg"
          : "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"}>
        <Text class="text-sm text-[#3c4954] font-bold">Sign in [A]</Text>
      </View>
      <Show when={props.authenticated}>
        <View class={props.setupField === 4 ? "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#fff1f1] to-[#f3d2d2] border-2 border-[#cf5a5a] rounded-lg" : "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="text-sm text-[#704040]">Sign out</Text>
        </View>
      </Show>
      <Text class="absolute left-[8] top-[222] text-xs text-[#6a7680]">
        {props.authenticated ? "B: Back" : props.providerReady ? "A: Edit" : "Starting…"}
      </Text>
    </>
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
  return (
    <>
      <Text class="absolute left-[8] top-[33] text-xs text-[#6a7680]">{label(props.title)}</Text>
      <View class="absolute right-[1] top-[48] w-[3] h-[140] bg-[#dde5eb]" />
      <View class="absolute right-[1] w-[3] h-[12] bg-[#aa5cc3]" style={{ insetT: 48 + 128 * (props.page.offset + props.index) / Math.max(1, props.page.total - 1) }} />
      <View class="absolute left-0 right-[4] top-[48] h-[140] overflow-hidden">
        <For each={props.visibleRows}>{item =>
          <View style={{ insetT: props.page.items.indexOf(item) * props.rowHeight - props.scrollY }} class={item === props.page.items[props.index] ? "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg overflow-hidden" : "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-white to-[#f0f1f3] border border-[#c4cbd1] rounded-lg overflow-hidden"}>
            <Text class="absolute left-[6] top-[5] text-xs text-[#3c4954]">{item.folder ? "> " : item.played ? "✓ " : "  "}{label(item.name)}</Text>
            <Show when={item.resume > 0 && item.seconds > 0}>
              <View class="absolute left-[4] bottom-0 h-[2] bg-[#aa5cc3]" style={{ width: Math.min(288, 288 * item.resume / item.seconds) }} />
            </Show>
          </View>
        }</For>
      </View>
      <Show when={!props.page.items.length}>
        <Text class="absolute left-[16] top-[91] text-sm text-[#6a7680]">{props.busy ? "Loading…" : props.mode === "search" ? "No results" : "No items"}</Text>
      </Show>
      <Show when={props.fetchingMore}>
        <View class="absolute left-[120] top-[168] w-[80] h-[20] rounded-lg bg-white items-center justify-center">
          <Text class="text-xs text-[#75409b]">Loading…</Text>
        </View>
      </Show>
      <View class="absolute left-[6] right-[6] top-[192] h-[28] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg">
        <Text class="text-xs text-[#3c4954]">Back [B]</Text>
        <Text class="text-xs text-[#75409b]">{props.playing ? "Now playing [SELECT]" : `${props.page.total} items`}</Text>
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
      <Text class="absolute left-[10] top-[43] text-xs text-[#3c4954]">{label(props.item.name)}</Text>
      <View class={props.detailFocus === 0 ? "absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"}>
        <Text class="text-sm text-[#3c4954]">{props.item.resume ? `Resume ${time(props.item.resume)} [A]` : "Play [A]"}</Text>
      </View>
      <Show when={props.item.resume > 0}>
        <View class={props.detailFocus === 1 ? "absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="text-sm text-[#3c4954]">Start over</Text>
        </View>
      </Show>
      <Show when={!props.item.resume}>
        <Text class="absolute left-[12] right-[12] top-[121] text-xs text-[#6a7680]">{props.overview.slice(0, 145)}</Text>
      </Show>
      <View class={props.detailFocus === 2 ? "absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
        <Text class="text-sm text-[#3c4954]">{props.playing ? "Back / Now playing" : "Back [B]"}</Text>
      </View>
    </>
  );
}

export function PlayerControlsView(props: {
  streamInfo: boolean;
  title: string;
  phase: string;
  videoSize: string;
  displayFps?: number;
  profile?: StreamProfile;
  playbackSeconds: number;
  durationSeconds: number;
  controlFocus: number;
  infoFocus: number;
  quality: Quality;
  volume: number;
}) {
  return (
    <>
      <Show when={!props.streamInfo}>
        <Text class="absolute left-[12] top-[38] text-sm text-[#3c4954] font-bold">{label(props.title)}</Text>
        <Text class="absolute left-[12] top-[59] text-xs text-[#75409b]">{props.phase} · {props.videoSize} · {props.profile?.hardware ? "MVD" : "CPU"}</Text>
        <Text class="absolute left-[24] top-[79] text-xs text-[#3c4954]">{time(props.playbackSeconds)}</Text>
        <Text class="absolute right-[24] top-[79] text-xs text-[#3c4954]">{time(props.durationSeconds)}</Text>
        <View class="absolute left-[24] top-[104] w-[272] h-[6] rounded-lg bg-[#d6dce2]" />
        <View class="absolute left-[24] top-[104] h-[6] rounded-lg bg-[#9452b3]" style={{ width: progressWidth(props.playbackSeconds, props.durationSeconds) }} />
        <View class="absolute top-[98] w-[17] h-[18] rounded-lg bg-white border-2 border-[#9452b3]" style={{ insetL: Math.min(287, 16 + progressWidth(props.playbackSeconds, props.durationSeconds)) }} />
        <View class="absolute left-[8] top-[126] w-[96] h-[42] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">−10s</Text></View>
        <View class={props.controlFocus === 0 ? "absolute left-[110] top-[126] w-[100] h-[42] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border-2 border-[#9452b3] rounded-lg" : "absolute left-[110] top-[126] w-[100] h-[42] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"}><Text class="text-sm text-[#3c4954] font-bold">{props.phase === "paused" ? "Play" : "Pause"}</Text></View>
        <View class="absolute left-[216] top-[126] w-[96] h-[42] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">+10s</Text></View>
        <View class={props.controlFocus === 1 ? "absolute left-[8] top-[177] w-[96] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#9452b3] rounded-lg" : "absolute left-[8] top-[177] w-[96] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#3c4954]">Stream</Text></View>
        <View class={props.controlFocus === 2 ? "absolute left-[110] top-[177] w-[100] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#9452b3] rounded-lg" : "absolute left-[110] top-[177] w-[100] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#3c4954]">Browse</Text></View>
        <View class={props.controlFocus === 3 ? "absolute left-[216] top-[177] w-[96] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#9452b3] rounded-lg" : "absolute left-[216] top-[177] w-[96] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#3c4954]">Stop</Text></View>
      </Show>
      <Show when={props.streamInfo}>
        <Text class="absolute left-[12] top-[39] text-sm text-[#3c4954] font-bold">Stream</Text>
        <Text class="absolute left-[12] top-[64] text-xs text-[#75409b]">Video {props.videoSize} · {props.displayFps ? `${props.displayFps.toFixed(1)} fps` : "measuring…"}</Text>
        <Text class="absolute left-[12] top-[86] text-xs text-[#3c4954]">{props.profile?.hardware ? "MVD" : "CPU"} · H.264 / AAC · MPEG-TS</Text>
        <Text class="absolute left-[12] top-[108] text-xs text-[#3c4954]">Max {props.profile?.maxWidth ?? 256}×{props.profile?.maxHeight ?? 144} · {props.profile?.maxFps ?? 12} fps</Text>
        <Text class="absolute left-[12] top-[126] text-xs text-[#6a7680]">Video ≤{props.profile?.videoKbps ?? 192} kb/s · Audio ≤64 kb/s</Text>
        <View class={props.infoFocus === 0 ? "absolute left-[8] right-[8] top-[150] h-[35] flex-row justify-around items-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border-2 border-[#9452b3] rounded-lg" : "absolute left-[8] right-[8] top-[150] h-[35] flex-row justify-around items-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#3c4954]">Quality</Text><Text class="text-sm text-[#75409b]">{props.quality === "native" ? "Native" : props.quality === "high" ? "High" : "Standard"} ›</Text></View>
        <View class={props.infoFocus === 1 ? "absolute left-[8] right-[8] top-[190] h-[29] flex-row justify-around items-center bg-gradient-to-b from-white to-[#e7eaee] border-2 border-[#9452b3] rounded-lg" : "absolute left-[8] right-[8] top-[190] h-[29] flex-row justify-around items-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#3c4954]">−</Text><Text class="text-sm text-[#75409b]">Volume {Math.round(props.volume * 100)}%</Text><Text class="text-sm text-[#3c4954]">+</Text></View>
      </Show>
    </>
  );
}
