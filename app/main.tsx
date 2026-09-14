import { createSignal, For, Show, onCleanup } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface, View, Text, Image, type NodeMirror } from "@pocketjs/framework/components";
import { onFrame, onButtonPress } from "@pocketjs/framework/lifecycle";
import { BTN } from "@pocketjs/framework/input";
import { createGesture } from "@pocketjs/framework/gesture";
import { createOsk, Osk } from "@pocketjs/framework/osk";
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
  const [message, setMessage] = createSignal("Starting the on-device Jellyfin service...");
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
  let history: Location[] = [];
  let frame = 0;
  let session = 0;
  let operation = 0;
  let plane: NodeMirror | undefined;

  const searchOsk = createOsk({
    value: query,
    setValue: setQuery,
    maxLength: 80,
    onCommit: (value) => {
      const text = value.trim();
      if (text) load({ mode: "search", title: text, query: text, offset: 0 });
    },
  });
  const serverOsk = createOsk({
    value: server,
    setValue: setServer,
    maxLength: 511,
    onCommit: () => setSetupField(1),
  });
  const usernameOsk = createOsk({
    value: username,
    setValue: setUsername,
    maxLength: 63,
    onCommit: () => setSetupField(2),
  });
  const passwordOsk = createOsk({
    value: password,
    setValue: setPassword,
    maxLength: 127,
    onCommit: () => setSetupField(3),
  });
  const anyOsk = () => searchOsk.isOpen() || serverOsk.isOpen() ||
    usernameOsk.isOpen() || passwordOsk.isOpen();

  function command(commandValue: unknown, done: (value: any) => void, foreground = true) {
    if (!rpc.connected()) {
      setMessage("The on-device service is still starting. Try again shortly.");
      return;
    }
    const owner = foreground ? ++operation : operation;
    if (foreground) {
      setBusy(true);
      setMessage("Working...");
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
        setMessage("The on-device service returned an invalid response.");
      }
    });
    if (!id) {
      if (foreground) setBusy(false);
      setMessage("The on-device service is busy. Try again.");
    }
  }

  function load(location: Location) {
    if (busy() || !authenticated()) return;
    command({ t: "list", ...location }, (data: Page) => {
      setScreen("browser");
      setWhere(location);
      setPage(data);
      setIndex(0);
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
      setMessage("Signed out. The saved password was never stored.");
    });
  }

  function editSetupField() {
    if (setupField() === 0) serverOsk.open();
    else if (setupField() === 1) usernameOsk.open();
    else if (setupField() === 2) passwordOsk.open();
    else if (setupField() === 3) login();
    else logout();
  }

  function open(item: Item) {
    if (busy()) return;
    if (item.folder) {
      history.push(where());
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
        setMessage("Video could not start. A New 3DS and DSP firmware are required.");
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
    if (previous) load(previous);
    else home("libraries");
  }

  function turn(delta: number) {
    const current = page();
    const next = current.offset + delta * PAGE_SIZE;
    if (!busy() && next >= 0 && next < current.total) load({ ...where(), offset: next });
  }

  function changeVolume(delta: number) {
    setVolume(Math.max(0, Math.min(1, volume() + delta)));
    player.volume(volume());
  }

  onButtonPress(BTN.UP, () => {
    if (screen() === "setup") setSetupField(Math.max(0, setupField() - 1));
    else if (!controls() && !detail()) setIndex(Math.max(0, index() - 1));
  });
  onButtonPress(BTN.DOWN, () => {
    if (screen() === "setup") setSetupField(Math.min(authenticated() ? 4 : 3, setupField() + 1));
    else if (!controls() && !detail()) setIndex(Math.min(page().items.length - 1, index() + 1));
  });
  onButtonPress(BTN.LEFT, () => screen() === "browser" && (controls() ? seek(-10) : turn(-1)));
  onButtonPress(BTN.RIGHT, () => screen() === "browser" && (controls() ? seek(10) : turn(1)));
  onButtonPress(BTN.CIRCLE, () => {
    if (screen() === "setup") editSetupField();
    else if (controls()) pause();
    else if (detail()) play(detail()!, detail()!.resume);
    else if (page().items[index()]) open(page().items[index()]);
  });
  onButtonPress(BTN.CROSS, back);
  onButtonPress(BTN.TRIANGLE, () => screen() === "browser" && !busy() && searchOsk.open());
  onButtonPress(BTN.SQUARE, () => screen() === "browser" && home("resume"));
  onButtonPress(BTN.START, pause);
  onButtonPress(BTN.SELECT, () => playing() ? setControls(!controls()) : showSetup());
  onButtonPress(BTN.LTRIGGER, () => seek(-10));
  onButtonPress(BTN.RTRIGGER, () => seek(10));

  createGesture({
    surface: "auxiliary",
    onTap: (contact) => {
      if (anyOsk() || busy()) return;
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
        else if (contact.x < 240) searchOsk.open();
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
        if (item) open(item);
      }
      if (contact.y >= 192 && contact.y < 220) {
        if (contact.x < 105) turn(-1);
        else if (contact.x < 215) back();
        else turn(1);
      }
    },
  });

  onFrame(() => {
    frame++;
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
        setMessage("The on-device Jellyfin service is unavailable.");
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
          <Text class="absolute left-[14] top-[14] text-sm text-[#008ab3] font-bold">Jellyfin3DS</Text>
          <Text class="absolute left-[14] top-[42] text-lg text-[#3c4954] font-bold">Internet Settings</Text>
          <View class="absolute left-[14] top-[77] h-[2] w-[88] bg-[#00b6e7]" />
          <Text class="absolute left-[14] top-[94] text-base text-[#3c4954]">Connect this system directly to Jellyfin.</Text>
          <Text class="absolute left-[14] top-[124] text-xs text-[#6a7680]">Only your 3DS and Jellyfin server are needed.</Text>
          <Text class="absolute left-[14] top-[145] text-xs text-[#6a7680]">Your password is used for sign-in, then discarded.</Text>
          <Text class="absolute left-[14] top-[169] text-sm text-[#008ab3]">Trusted HTTPS or local-network HTTP</Text>
      </View>
      <Show when={!playing() && screen() === "browser"}>
        <View class="absolute left-[12] top-[12] right-[12] bottom-[42] p-[12] rounded-xl bg-white border border-[#c4cbd1] flex-col gap-2">
          <Text class="text-sm text-[#008ab3] font-bold">Jellyfin3DS</Text>
          <Text class="text-lg text-[#3c4954] font-bold">Select something to watch</Text>
          <View class="h-[2] w-[72] bg-[#00b6e7]" />
          <Text class="text-base text-[#3c4954]">{selected()?.name ?? "Your Jellyfin library"}</Text>
          <Text class="text-sm text-[#6a7680]">{selected()
            ? `${selected()!.type}${selected()!.year ? ` / ${selected()!.year}` : ""}${selected()!.seconds ? ` / ${time(selected()!.seconds)}` : ""}`
            : `Connected directly to ${server()}`}</Text>
          <Text class="text-sm text-[#008ab3]">{selected()?.resume
            ? `Resume at ${time(selected()!.resume)}` : selected()?.played ? "Watched" : ""}</Text>
        </View>
        <Text class="absolute left-[22] bottom-[15] text-xs text-[#6a7680]">Video requires a New 3DS / New 2DS XL.</Text>
      </Show>
      <Show when={screen() === "boot"}>
        <View class="absolute inset-0 items-center justify-center flex-col gap-2">
          <Text class="text-lg text-[#3c4954] font-bold">Jellyfin3DS</Text>
          <Text class="text-sm text-[#008ab3]">Starting on-device service...</Text>
        </View>
      </Show>
      <Show when={message() && message() !== "Working..." && (!playing() || status()?.phase === "error")}>
        <View class="absolute left-[20] right-[20] bottom-[30] p-[8] rounded-lg bg-[#fff8df] border border-[#dacb99]"><Text class="text-xs text-[#6a5b36]">{message()}</Text></View>
      </Show>
      <Show when={searchOsk.isOpen() && !playing()}>
        <View class="absolute left-[12] right-[12] top-[12] bottom-[42] p-[16] rounded-xl bg-white border border-[#c4cbd1] flex-col gap-3">
          <Text class="text-lg text-[#008ab3] font-bold">Search your library</Text>
          <Text class="text-base text-[#3c4954]">{query() || "Enter a movie, series or episode."}</Text>
          <Text class="text-xs text-[#6a7680]">Touch the keys, or use D-pad and A. START searches.</Text>
        </View>
      </Show>
      <Show when={anyOsk() && screen() === "setup"}>
        <View class="absolute left-[12] right-[12] top-[12] bottom-[18] p-[16] rounded-xl bg-white border border-[#c4cbd1] flex-col gap-3">
          <Text class="text-lg text-[#008ab3] font-bold">{serverOsk.isOpen() ? "Jellyfin server" : usernameOsk.isOpen() ? "Username" : "Password"}</Text>
          <Text class="text-base text-[#3c4954]">{serverOsk.isOpen() ? server() : usernameOsk.isOpen() ? username() : passwordLabel()}</Text>
          <Text class="text-xs text-[#6a7680]">START accepts. B closes the keyboard.</Text>
        </View>
      </Show>
      <Show when={playing() && !(status()?.presentedFrames)}>
        <View class="absolute inset-0 items-center justify-center"><Text class="text-base text-white">{status()?.phase === "error" ? "Playback unavailable" : "Buffering video..."}</Text></View>
      </Show>
    </View>

    <AuxiliarySurface>{() => <View class="relative w-full h-full bg-[#f5f5f5] overflow-hidden">
      <Show when={screen() === "setup" && !anyOsk()}>
        <View class="absolute left-0 top-0 w-full h-[32] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]"><Text class="text-sm text-[#3c4954] font-bold">Jellyfin Connection Settings</Text></View>
        <View class={setupField() === 0 ? "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg" : "absolute left-[8] right-[8] top-[43] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Server URL</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{label(server())}</Text>
        </View>
        <View class={setupField() === 1 ? "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg" : "absolute left-[8] right-[8] top-[86] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Username</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{username() || "Enter username"}</Text>
        </View>
        <View class={setupField() === 2 ? "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg" : "absolute left-[8] right-[8] top-[129] h-[39] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}>
          <Text class="absolute left-[8] top-[4] text-xs text-[#6a7680]">Password (not saved)</Text><Text class="absolute left-[8] top-[19] text-xs text-[#3c4954]">{passwordLabel()}</Text>
        </View>
        <View class={authenticated()
          ? setupField() === 3
            ? "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg"
            : "absolute left-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] rounded-lg"
          : setupField() === 3
            ? "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg"
            : "absolute left-[8] right-[8] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] rounded-lg"}>
          <Text class="text-sm text-[#3c4954] font-bold">Sign in [A]</Text>
        </View>
        <Show when={authenticated()}><View class={setupField() === 4 ? "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-[#fff1f1] to-[#f3d2d2] border-2 border-[#cf5a5a] rounded-lg" : "absolute right-[8] w-[144] top-[176] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"}><Text class="text-sm text-[#704040]">Sign out</Text></View></Show>
        <Text class="absolute left-[8] top-[222] text-xs text-[#6a7680]">{authenticated() ? "B: Back without changes" : providerReady() ? "Direct service ready" : "Starting service"}</Text>
      </Show>

      <Show when={screen() === "browser"}>
        <View class="absolute left-0 top-0 w-full h-[32] flex-row items-center justify-around bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca]">
          <Text class="text-xs text-[#3c4954] font-bold">Libraries</Text><Text class="text-xs text-[#3c4954] font-bold">Continue</Text><Text class="text-xs text-[#008ab3] font-bold">Search</Text><Text class="text-xs text-[#3c4954] font-bold">Account</Text>
        </View>
        <Show when={!controls() && !detail()}>
          <Text class="absolute left-[8] top-[33] text-xs text-[#6a7680]">{label(where().title)}</Text>
          <For each={page().items}>{(item, row) => <View style={{ insetT: 48 + row() * 28 }} class={row() === index() ? "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-[#e8fbff] to-[#c8f0fa] border-2 border-[#00b6e7] rounded-lg overflow-hidden" : "absolute left-[6] right-[6] h-[27] bg-gradient-to-b from-white to-[#f0f1f3] border border-[#c4cbd1] rounded-lg overflow-hidden"}>
            <Text class="absolute left-[6] top-[5] text-xs text-[#3c4954]">{item.folder ? "> " : "  "}{label(item.name)}</Text>
          </View>}</For>
          <Show when={!page().items.length}><Text class="absolute left-[16] top-[91] text-sm text-[#6a7680]">{providerReady() ? "No videos here. Try another library." : "Starting on-device service..."}</Text></Show>
          <View class="absolute left-[6] right-[6] top-[192] h-[28] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-xs text-[#3c4954]">Prev</Text><Text class="text-xs text-[#3c4954]">Back [B]</Text><Text class="text-xs text-[#3c4954]">Next</Text></View>
        </Show>
        <Show when={detail() && !controls()}>
          <Text class="absolute left-[10] top-[43] text-xs text-[#3c4954]">{label(detail()!.name)}</Text>
          <View class="absolute left-[10] right-[10] top-[76] h-[40] items-center justify-center bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] rounded-lg"><Text class="text-sm text-[#3c4954]">{detail()!.resume ? `Resume ${time(detail()!.resume)} [A]` : "Play [A]"}</Text></View>
          <View class="absolute left-[10] right-[10] top-[122] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Play from beginning</Text></View>
          <View class="absolute left-[10] right-[10] top-[170] h-[40] items-center justify-center bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] rounded-lg"><Text class="text-sm text-[#3c4954]">Back [B]</Text></View>
        </Show>
        <Show when={controls()}>
          <Text class="absolute left-[10] top-[40] text-xs text-[#3c4954]">{label(playing()?.name ?? "")}</Text>
          <Text class="absolute left-[10] top-[61] text-xs text-[#008ab3]">{time((status()?.positionMs ?? 0) / 1000)} / {time(playing()?.seconds ?? 0)} - {status()?.phase ?? "opening"}</Text>
          <View class="absolute left-[8] right-[8] top-[82] h-[44] bg-gradient-to-b from-[#e6faff] to-[#b9eaf6] border border-[#13a8cf] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">-10s</Text><Text class="text-sm text-[#3c4954]">{status()?.phase === "paused" ? "Resume" : "Pause"}</Text><Text class="text-sm text-[#3c4954]">+10s</Text></View>
          <View class="absolute left-[8] right-[8] top-[134] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Vol -</Text><Text class="text-sm text-[#008ab3]">{Math.round(volume() * 100)}%</Text><Text class="text-sm text-[#3c4954]">Vol +</Text></View>
          <View class="absolute left-[8] right-[8] top-[180] h-[40] bg-gradient-to-b from-white to-[#e7eaee] border border-[#bbc3ca] flex-row justify-around items-center rounded-lg"><Text class="text-sm text-[#3c4954]">Browse</Text><Text class="text-sm text-[#3c4954]">Stop</Text></View>
        </Show>
        <Text class="absolute left-[6] top-[223] text-xs text-[#6a7680]">{label(message() || "A: Open / X: Search / SELECT: Account")}</Text>
      </Show>

      <Show when={anyOsk()}>
        <View class="absolute inset-0 bg-[#f5f5f5] flex-col justify-end">
          <Text class="text-sm text-[#3c4954]">{searchOsk.isOpen() ? searchOsk.display() : serverOsk.isOpen() ? serverOsk.display() : usernameOsk.isOpen() ? usernameOsk.display() : `${"*".repeat(password().length)}|`}</Text>
          <Show when={searchOsk.isOpen()}><Osk osk={searchOsk} surface="auxiliary" keyHeight={25} theme="light" /></Show>
          <Show when={serverOsk.isOpen()}><Osk osk={serverOsk} surface="auxiliary" keyHeight={25} theme="light" /></Show>
          <Show when={usernameOsk.isOpen()}><Osk osk={usernameOsk} surface="auxiliary" keyHeight={25} theme="light" /></Show>
          <Show when={passwordOsk.isOpen()}><Osk osk={passwordOsk} surface="auxiliary" keyHeight={25} theme="light" /></Show>
        </View>
      </Show>
    </View>}</AuxiliarySurface>
  </>;
}

mount(() => <App />);
