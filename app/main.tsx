import { createSignal, For, Show, onCleanup } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface, View, Text, Image, type NodeMirror } from "@pocketjs/framework/components";
import { onFrame, onButtonPress } from "@pocketjs/framework/lifecycle";
import { BTN } from "@pocketjs/framework/input";
import { createGesture } from "@pocketjs/framework/gesture";
import { offload } from "@pocketjs/framework/offload";
import { mediaPlayer, type MediaStatus } from "@pocketjs/framework/media";
import { getOps } from "@pocketjs/framework/host";
import {
  type DirectMediaStatus,
  type Hello,
  type Item,
  type Page,
  PAGE_SIZE,
  time,
} from "./protocol.ts";

type Location = {
  mode: "libraries" | "folder" | "resume" | "search";
  title: string;
  offset: number;
  parent?: string;
  query?: string;
};
type Screen = "boot" | "setup" | "browser";
type PlayerStatus = MediaStatus & DirectMediaStatus;

function App() {
  const rpc = offload();
  const player = mediaPlayer();
  const [screen, setScreen] = createSignal<Screen>("boot");
  const [providerReady, setProviderReady] = createSignal(false);
  const [authenticated, setAuthenticated] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("Starting…");
  const [server, setServer] = createSignal("http://");
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [setupField, setSetupField] = createSignal(0);
  const [where, setWhere] = createSignal<Location>({ mode: "libraries", title: "Libraries", offset: 0 });
  const [page, setPage] = createSignal<Page>({ items: [], offset: 0, total: 0 });
  const [index, setIndex] = createSignal(0);
  const [detail, setDetail] = createSignal<Item>();
  const [playing, setPlaying] = createSignal<Item>();
  const [status, setStatus] = createSignal<PlayerStatus>();
  const [controls, setControls] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [volume, setVolume] = createSignal(0.8);
  let history: { location: Location; page: Page; index: number }[] = [];
  let frame = 0;
  let session = 0;
  let operation = 0;
  let plane: NodeMirror | undefined;
  let artPlane: NodeMirror | undefined;
  const [art, setArt] = createSignal<{handle:number;width:number;height:number}>();
  let artWanted = "", artAge = 0, artPending = false, dragY = 0;


  function editField(field: "server" | "username" | "password" | "search") {
    if (busy()) return;
    const value = field === "server" ? server() : field === "username" ? username() : field === "password" ? password() : query();
    command({t:"keyboard",field,value}, (reply: {accepted:boolean;value?:string}) => {
      if (!reply.accepted || typeof reply.value !== "string") return;
      if (field === "server") { setServer(reply.value); setSetupField(1); }
      else if (field === "username") { setUsername(reply.value); setSetupField(2); }
      else if (field === "password") { setPassword(reply.value); setSetupField(3); }
      else {
        const text=reply.value.trim(); setQuery(text);
        if(text)load({mode:"search",title:text,query:text,offset:0});
      }
    });
  }

  function command(commandValue: unknown, done: (value: any) => void, foreground = true) {
    if (!rpc.connected()) {
      setMessage("Starting…");
      return;
    }
    const owner = foreground ? ++operation : operation;
    if (foreground) {
      setBusy(true);
      setMessage("Loading…");
    }
    const id = rpc.request("jellyfin.command", JSON.stringify(commandValue), (result) => {
      if (foreground && owner !== operation) return;
      if (foreground) setBusy(false);
      if (!result.ok) {
        setMessage(result.error);
        if (result.error.startsWith("Sign-in")) {
          setAuthenticated(false);
          setScreen("setup");
          setPassword("");
        }
        return;
      }
      try {
        const value = JSON.parse(result.value);
        if (foreground) setMessage("");
        done(value);
      } catch {
        setMessage("Invalid server response.");
      }
    });
    if (!id) {
      if (foreground) setBusy(false);
      setMessage("Busy. Try again.");
    }
  }

  function load(location: Location, selectedIndex = 0) {
    if (busy() || !authenticated()) return;
    command({ t: "list", ...location }, (data: Page) => {
      setScreen("browser");
      setWhere(location);
      setPage(data);
      setIndex(Math.min(selectedIndex, Math.max(0, data.items.length - 1)));
      setDetail(undefined);
      setControls(false);
    });
  }

  function home(mode: "libraries" | "resume") {
    history = [];
    load({ mode, title: mode === "resume" ? "Continue watching" : "Libraries", offset: 0 });
  }

  function showSetup() {
    if (playing()) stop();
    setScreen("setup");
    setSetupField(0);
    setPassword("");
    setMessage("");
  }

  function login() {
    if (busy()) return;
    if (!server().trim() || !username().trim()) {
      setMessage("Server URL and username are required.");
      return;
    }
    command({ t: "login", server: server().trim(), username: username().trim(), password: password() },
      (hello: Hello) => {
        setPassword("");
        setAuthenticated(hello.authenticated);
        setServer(hello.server || server());
        setUsername(hello.username || username());
        if (!hello.authenticated) {
          setScreen("setup");
          setMessage("Jellyfin did not accept this account.");
          return;
        }
        setMessage(hello.persisted === false ? "Signed in, but the token could not be saved." : "");
        home("libraries");
      });
  }

  function logout() {
    if (busy()) return;
    player.close();
    setPlaying(undefined);
    setStatus(undefined);
    command({ t: "logout" }, (hello: Hello) => {
      setAuthenticated(false);
      setServer(hello.server || server());
      setUsername(hello.username || username());
      setPassword("");
      setPage({ items: [], total: 0, offset: 0 });
      setScreen("setup");
      setSetupField(0);
      setMessage("Signed out.");
    });
  }

  function editSetupField() {
    if (setupField() === 0) editField("server");
    else if (setupField() === 1) editField("username");
    else if (setupField() === 2) editField("password");
    else if (setupField() === 3) login();
    else logout();
  }

  function open(item: Item) {
    if (busy()) return;
    if (item.folder) {
      if (history.length >= 16) history.shift();
      history.push({ location: where(), page: page(), index: index() });
      load({ mode: "folder", title: item.name, parent: item.id, offset: 0 });
    } else {
      setDetail(item);
      setControls(false);
    }
  }

  function play(item: Item, seconds: number) {
    if (busy()) return;
    player.close();
    setPlaying(undefined);
    setStatus(undefined);
    command({ t: "play", id: item.id, seconds, duration: item.seconds }, (data) => {
      setPlaying({ ...item, seconds: data.seconds });
      setControls(true);
      setDetail(undefined);
      if (!player.open(data.source)) {
        setMessage("Video could not start. Check DSP firmware and server transcoding.");
        command({ t: "stop", seconds }, () => {}, false);
        setPlaying(undefined);
        return;
      }
      player.volume(volume());
      if (plane) getOps().setImage(plane.id, player.texture());
    });
  }

  function report() {
    const item = playing();
    const current = status();
    if (item && current) command({
      t: "progress",
      id: item.id,
      seconds: current.positionMs / 1000,
      paused: current.phase === "paused",
    }, () => {}, false);
  }

  function stop() {
    const seconds = (status()?.positionMs ?? 0) / 1000;
    operation++;
    setBusy(false);
    player.close();
    setPlaying(undefined);
    setStatus(undefined);
    setControls(false);
    command({ t: "stop", seconds }, () => {}, false);
  }

  function pause() {
    if (!playing()) return;
    if (status()?.phase === "ended") {
      play(playing()!, 0);
      return;
    }
    player.pause(status()?.phase !== "paused");
  }

  function seek(delta: number) {
    const item = playing();
    if (item) play(item, Math.max(0, (status()?.positionMs ?? 0) / 1000 + delta));
  }

  function back() {
    if (busy()) return;
    if (screen() === "setup") {
      if (authenticated()) {
        setScreen("browser");
        setMessage("");
      }
      return;
    }
    if (detail()) {
      setDetail(undefined);
      return;
    }
    if (controls()) {
      setControls(false);
      return;
    }
    const previous = history.pop();
    if (previous) {
      setWhere(previous.location); setPage(previous.page); setIndex(previous.index);
      setDetail(undefined); setControls(false); setMessage("");
    }
    else home("libraries");
  }

  function move(delta: number) {
    if (busy() || screen() !== "browser" || controls() || detail()) return;
    const next = index() + delta;
    if (next >= 0 && next < page().items.length) { setIndex(next); return; }
    const offset = page().offset + delta;
    if (offset >= 0 && offset + (delta > 0 ? PAGE_SIZE - 1 : 0) < page().total)
      load({ ...where(), offset }, delta > 0 ? PAGE_SIZE - 1 : 0);
  }

  function changeVolume(delta: number) {
    setVolume(Math.max(0, Math.min(1, volume() + delta)));
    player.volume(volume());
  }

  onButtonPress(BTN.UP, () => {
    if (screen() === "setup") setSetupField(Math.max(0, setupField() - 1));
    else if (!controls() && !detail()) move(-1);
  });
  onButtonPress(BTN.DOWN, () => {
    if (screen() === "setup") setSetupField(Math.min(authenticated() ? 4 : 3, setupField() + 1));
    else if (!controls() && !detail()) move(1);
  });
  onButtonPress(BTN.LEFT, () => screen() === "browser" && (controls() && seek(-10)));
  onButtonPress(BTN.RIGHT, () => screen() === "browser" && (controls() && seek(10)));
  onButtonPress(BTN.CIRCLE, () => {
    if (screen() === "setup") editSetupField();
    else if (controls()) pause();
    else if (detail()) play(detail()!, detail()!.resume);
    else if (page().items[index()]) open(page().items[index()]);
  });
  onButtonPress(BTN.CROSS, back);
  onButtonPress(BTN.TRIANGLE, () => screen() === "browser" && !busy() && editField("search"));
  onButtonPress(BTN.SQUARE, () => screen() === "browser" && home("resume"));
  onButtonPress(BTN.START, pause);
  onButtonPress(BTN.SELECT, () => playing() ? setControls(!controls()) : showSetup());
  onButtonPress(BTN.LTRIGGER, () => seek(-10));
  onButtonPress(BTN.RTRIGGER, () => seek(10));

  createGesture({
    surface: "auxiliary",
    axis: "y",
    onPanStart: () => { dragY = 0; },
    onPanMove: (contact) => {
      if (busy() || contact.startY < 48 || contact.startY >= 188) return;
      dragY += contact.fdy;
      if (Math.abs(dragY) >= 24) { move(dragY < 0 ? 1 : -1); dragY = 0; }
    },
    onTap: (contact) => {
      if (busy()) return;
      if (screen() === "setup") {
        let chosen = -1;
        if (contact.y >= 43 && contact.y < 82) chosen = 0;
        else if (contact.y >= 86 && contact.y < 125) chosen = 1;
        else if (contact.y >= 129 && contact.y < 168) chosen = 2;
        else if (contact.y >= 176 && contact.y < 216) {
          chosen = authenticated() && contact.x >= 160 ? 4 : 3;
        }
        if (chosen >= 0) {
          setSetupField(chosen);
          editSetupField();
        }
        return;
      }
      if (contact.y < 32) {
        if (contact.x < 80) home("libraries");
        else if (contact.x < 160) home("resume");
        else if (contact.x < 240) editField("search");
        else showSetup();
        return;
      }
      if (controls()) {
        if (contact.y >= 82 && contact.y < 126) {
          if (contact.x < 100) seek(-10);
          else if (contact.x < 220) pause();
          else seek(10);
        }
        if (contact.y >= 134 && contact.y < 174)
          changeVolume(contact.x < 160 ? -0.1 : 0.1);
        if (contact.y >= 180 && contact.y < 220) {
          if (contact.x < 160) setControls(false);
          else stop();
        }
        return;
      }
      if (detail()) {
        if (contact.y >= 76 && contact.y < 116) play(detail()!, detail()!.resume);
        else if (contact.y >= 122 && contact.y < 162) play(detail()!, 0);
        else if (contact.y >= 170 && contact.y < 213) back();
        return;
      }
      if (contact.y >= 48 && contact.y < 188) {
        const item = page().items[Math.floor((contact.y - 48) / 28)];
        if (item) {
          const row = Math.floor((contact.y - 48) / 28);
          if (row === index()) open(item); else setIndex(row);
        }
      }
      if (contact.y >= 192 && contact.y < 220) {
        if (contact.x < 105) move(-1);
        else if (contact.x < 215) back();
        else move(1);
      }
    },
  });

  onFrame(() => {
    frame++;
    const wanted = !playing() && screen() === "browser" ? (selected()?.artId ?? selected()?.id ?? "") : "";
    if (wanted !== artWanted) { artWanted = wanted; artAge = 0; setArt(undefined); }
    artAge++;
    if (wanted && artAge === 24 && !artPending && !busy() && rpc.connected()) {
      artPending = true;
      const key = wanted;
      const request = rpc.request("jellyfin.command", JSON.stringify({t:"art", id:key}), result => {
        artPending = false;
        if (key !== artWanted || !result.ok) return;
        try {
          const value = JSON.parse(result.value);
          if (value.handle >= 0 && value.width > 0 && value.height > 0) {
            setArt(value);
            if (artPlane) getOps().setImage(artPlane.id, value.handle);
          }
        } catch { /* Keep the placeholder when artwork is missing. */ }
      });
      if (!request) artPending = false;
    }
    if (wanted && !art() && (artPending || busy()) && artAge >= 24) artAge = 23;

    const current = rpc.session();
    if (current !== session) {
      operation++;
      setBusy(false);
      setProviderReady(current > 0);
      player.close();
      setPlaying(undefined);
      setStatus(undefined);
      setControls(false);
      session = current;
      if (current > 0) {
        command({ t: "hello" }, (hello: Hello) => {
          setServer(hello.server || "http://");
          setUsername(hello.username || "");
          setAuthenticated(hello.authenticated);
          setPassword("");
          if (hello.authenticated) home("libraries");
          else {
            setScreen("setup");
            setMessage("");
          }
        });
      } else {
        setScreen("boot");
        setMessage("Service unavailable.");
      }
    }
    if (frame % 6 === 0 && playing()) {
      const old = status();
      const currentStatus = player.status() as PlayerStatus;
      setStatus(currentStatus);
      if (currentStatus.phase === "error" && old?.phase !== "error") {
        setMessage(currentStatus.error);
        command({ t: "stop", seconds: currentStatus.positionMs / 1000 }, () => {}, false);
        player.close();
        setPlaying(undefined);
        setControls(false);
      }
      if (currentStatus.phase === "ended" && old?.phase !== "ended") {
        command({ t: "stop", seconds: currentStatus.positionMs / 1000 }, () => {}, false);
        setMessage("Playback finished.");
      }
      if (currentStatus.phase !== old?.phase &&
          ["paused", "playing"].includes(currentStatus.phase)) report();
    }
    if (frame % 300 === 0 && playing() &&
        ["playing", "paused"].includes(status()?.phase ?? "")) report();
  });

  onCleanup(() => player.close());
  const selected = () => detail() ?? page().items[index()];
  const label = (value: string) => value.length > 40 ? `${value.slice(0, 37)}...` : value;
  const passwordLabel = () => password().length ? "*".repeat(Math.min(24, password().length)) : "Password";
  const videoRect = () => {
    const width = Math.max(1, status()?.videoWidth ?? 400);
    const height = Math.max(1, status()?.videoHeight ?? 240);
    const scale = Math.min(400 / width, 240 / height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    return { x: Math.floor((400 - w) / 2), y: Math.floor((240 - h) / 2), w, h };
  };

  return <>
    <View class="relative w-full h-full bg-[#f0f1f4] overflow-hidden">
      <Show when={playing()}><View class="absolute inset-0 bg-black" /></Show>
      <Image
        nodeRef={(node) => { plane = node; getOps().setImage(node.id, player.texture()); }}
        class="absolute"
        style={{ insetL: videoRect().x, insetT: videoRect().y, width: videoRect().w,
          height: videoRect().h, opacity: playing() && (status()?.presentedFrames ?? 0) > 0 ? 1 : 0 }}
      />
      <View
        class="absolute left-[12] top-[12] right-[12] bottom-[18] rounded-xl bg-white border border-[#c4cbd1]"
        style={{ opacity: !playing() && screen() === "setup" ? 1 : 0 }}
      >
          <Text class="absolute left-[14] top-[14] text-sm text-[#75409b] font-bold">Jellyfin3DS</Text>
          <Text class="absolute left-[14] top-[42] text-lg text-[#3c4954] font-bold">Account</Text>
          <View class="absolute left-[14] top-[77] h-[2] w-[88] bg-[#aa5cc3]" />
          <Text class="absolute left-[14] top-[94] text-base text-[#3c4954]">Sign in below.</Text>
      </View>
      <Show when={!playing() && screen() === "browser"}>
        <View class="absolute left-[12] top-[8] right-[12] bottom-[10] rounded-xl bg-white border border-[#c4cbd1]">
          <View class="absolute left-[59] top-[6] w-[256] h-[144] rounded-lg bg-[#edf3f6] items-center justify-center">
            <Text class="text-sm text-[#8c9ba6]">{art() ? "" : "Jellyfin3DS"}</Text>
          </View>
          <Image nodeRef={node => { artPlane = node; if (art()) getOps().setImage(node.id, art()!.handle); }}
            class="absolute" style={{insetL:59+(256-(art()?.width ?? 256))/2,insetT:6+(144-(art()?.height ?? 144))/2,width:art()?.width ?? 256,height:art()?.height ?? 144,opacity:art()?1:0}} />
          <Text class="absolute left-[12] top-[158] text-base text-[#3c4954] font-bold">{label(selected()?.name ?? "Library")}</Text>
          <Text class="absolute left-[12] top-[184] text-xs text-[#75409b]">{selected() ? `${selected()!.type}${selected()!.year ? ` / ${selected()!.year}` : ""}${selected()!.resume ? ` / Resume ${time(selected()!.resume)}` : ""}` : "Select an item"}</Text>
        </View>
      </Show>
      <Show when={screen() === "boot"}>
        <View class="absolute inset-0 items-center justify-center flex-col gap-2">
          <Text class="text-lg text-[#3c4954] font-bold">Jellyfin3DS</Text>
          <View class="w-[64] h-[48] rounded-xl bg-[#aa5cc3] items-center justify-center"><Text class="text-lg text-white font-bold">Play</Text></View>
          <Text class="text-xs text-[#6a7680]">Starting…</Text>
        </View>
      </Show>
      <Show when={message() && message() !== "Loading…" && (!playing() || status()?.phase === "error")}>
        <View class="absolute left-[20] right-[20] bottom-[30] p-[8] rounded-lg bg-[#fff8df] border border-[#dacb99]"><Text class="text-xs text-[#6a5b36]">{message()}</Text></View>
      </Show>
      <Show when={playing() && !(status()?.presentedFrames)}>
        <View class="absolute inset-0 items-center justify-center"><Text class="text-base text-white">{status()?.phase === "error" ? "Playback unavailable" : "Buffering…"}</Text></View>
      </Show>
    </View>

    <AuxiliarySurface>{() => <View class="relative w-full h-full bg-[#f5f5f5] overflow-hidden">
      <Show when={screen() === "setup"}>
        <View class="absolute left-0 top-0 w-full h-[32] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]"><Text class="text-sm text-[#3c4954] font-bold">Account</Text></View>
        <View class={setupField() === 0 ? "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Server URL</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{label(server())}</Text>
        </View>
        <View class={setupField() === 1 ? "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Username</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{username() || "Enter username"}</Text>
        </View>
        <View class={setupField() === 2 ? "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg" : "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Password</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{passwordLabel()}</Text>
        </View>
        <View class={authenticated()
          ? setupField() === 3
            ? "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg"
            : "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"
          : setupField() === 3
            ? "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg"
            : "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"}>
          <Text class="text-sm text-[#3c4954] font-bold">Sign in [A]</Text>
        </View>
        <Show when={authenticated()}><View class={setupField() === 4 ? "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#fff1f1] to-[#f3d2d2] border-2 border-[#cf5a5a] rounded-lg" : "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#704040]">Sign out</Text></View></Show>
        <Text class="absolute left-[8] top-[222] text-xs text-[#6a7680]">{authenticated() ? "B: Back" : providerReady() ? "A: Edit" : "Starting…"}</Text>
      </Show>

      <Show when={screen() === "browser"}>
        <View class="absolute left-0 top-0 w-full h-[32] flex-row items-center justify-around bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]">
          <Text class="text-xs text-[#3c4954] font-bold">Libraries</Text><Text class="text-xs text-[#3c4954] font-bold">Continue</Text><Text class="text-xs text-[#75409b] font-bold">Search</Text><Text class="text-xs text-[#3c4954] font-bold">Account</Text>
        </View>
        <Show when={!controls() && !detail()}>
          <Text class="absolute left-[8] top-[33] text-xs text-[#6a7680]">{label(where().title)}</Text>
          <View class="absolute right-[1] top-[48] w-[3] h-[140] bg-[#dde5eb]" />
          <View class="absolute right-[1] w-[3] h-[12] bg-[#aa5cc3]" style={{insetT:48+128*(page().offset+index())/Math.max(1,page().total-1)}} />
          <For each={page().items}>{(item, row) => <View style={{ insetT: 48 + row() * 28 }} class={row() === index() ? "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-[#f6edfa] to-[#e8d5f2] border-2 border-[#aa5cc3] rounded-lg overflow-hidden" : "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-white to-[#f0f1f3] border border-[#c4cbd1] rounded-lg overflow-hidden"}>
            <Text class="absolute left-[6] top-[5] text-xs text-[#3c4954]">{item.folder ? "> " : "  "}{label(item.name)}</Text>
          </View>}</For>
          <Show when={!page().items.length}><Text class="absolute left-[16] top-[91] text-sm text-[#6a7680]">{providerReady() ? "No items" : "Starting…"}</Text></Show>
          <View class="absolute left-[6] right-[6] top-[192] h-[28] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-xs text-[#3c4954]">Up</Text><Text class="text-xs text-[#3c4954]">Back [B]</Text><Text class="text-xs text-[#3c4954]">Down</Text></View>
        </Show>
        <Show when={detail() && !controls()}>
          <Text class="absolute left-[10] top-[43] text-xs text-[#3c4954]">{label(detail()!.name)}</Text>
          <View class="absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] rounded-lg"><Text class="text-sm text-[#3c4954]">{detail()!.resume ? `Resume ${time(detail()!.resume)} [A]` : "Play [A]"}</Text></View>
          <View class="absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Start over</Text></View>
          <View class="absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Back [B]</Text></View>
        </Show>
        <Show when={controls()}>
          <Text class="absolute left-[10] top-[40] text-xs text-[#3c4954]">{label(playing()?.name ?? "")}</Text>
          <Text class="absolute left-[10] top-[61] text-xs text-[#75409b]">{time((status()?.positionMs ?? 0) / 1000)} / {time(playing()?.seconds ?? 0)} - {status()?.phase ?? "opening"}</Text>
          <View class="absolute left-[8] right-[8] top-[82] h-[44] bg-gradient-to-b from-[#f6edfa] to-[#dfc5ed] border border-[#9452b3] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">-10s</Text><Text class="text-sm text-[#3c4954]">{status()?.phase === "paused" ? "Resume" : "Pause"}</Text><Text class="text-sm text-[#3c4954]">+10s</Text></View>
          <View class="absolute left-[8] right-[8] top-[134] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Vol -</Text><Text class="text-sm text-[#75409b]">{Math.round(volume() * 100)}%</Text><Text class="text-sm text-[#3c4954]">Vol +</Text></View>
          <View class="absolute left-[8] right-[8] top-[180] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Browse</Text><Text class="text-sm text-[#3c4954]">Stop</Text></View>
        </Show>
        <Text class="absolute left-[6] top-[223] text-xs text-[#6a7680]">{label(message() || "A: Open   X: Search")}</Text>
      </Show>

    </View>}</AuxiliarySurface>
  </>;
}

mount(() => <App />);
