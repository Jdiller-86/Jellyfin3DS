import { createSignal, For, Show, onCleanup } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { AuxiliarySurface, View, Text, Image, type NodeMirror } from "@pocketjs/framework/components";
import { onFrame, onButtonPress, analogY } from "@pocketjs/framework/lifecycle";
import { BTN } from "@pocketjs/framework/input";
import { createGesture } from "@pocketjs/framework/gesture";
import { offload } from "@pocketjs/framework/offload";
import { mediaPlayer, type MediaStatus } from "@pocketjs/framework/media";
import { getOps } from "@pocketjs/framework/host";
import {
  type DirectMediaStatus,
  type Hello,
  type Item,
  type Metadata,
  type Page,
  type Quality,
  type StreamProfile,
  PAGE_SIZE,
  time,
} from "./protocol.ts";
import { clampPosition, seekAtX } from "./stream.ts";
import {
  ROW_HEIGHT,
  UI,
  clampScroll as clampListScroll,
  hitTestControls,
  hitTestDetail,
  hitTestNav,
  hitTestSetup,
} from "./ui.ts";
import {
  BrowserListView,
  DetailView,
  NavBar,
  PlayerControlsView,
  SetupView,
  label,
} from "./views.tsx";

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
  const [detailFocus, setDetailFocus] = createSignal(0);
  const [detail, setDetail] = createSignal<Item>();
  const [playing, setPlaying] = createSignal<Item>();
  const [status, setStatus] = createSignal<PlayerStatus>();
  const [controls, setControls] = createSignal(false);
  const [streamInfo, setStreamInfo] = createSignal(false);
  const [infoFocus, setInfoFocus] = createSignal(0);
  const [seekPreview, setSeekPreview] = createSignal<number>();
  const [quality, setQuality] = createSignal<Quality>("standard");
  const [profile, setProfile] = createSignal<StreamProfile>();
  const [newModel, setNewModel] = createSignal(false);
  const [hardwareDecode, setHardwareDecode] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [volume, setVolume] = createSignal(0.8);
  let history: { location: Location; page: Page; index: number; scroll: number }[] = [];
  let frame = 0;
  let navHold = 0;
  let navDir = 0;
  let session = 0;
  let operation = 0;
  let plane: NodeMirror | undefined;
  let artPlane: NodeMirror | undefined;
  const [art, setArt] = createSignal<{handle:number;width:number;height:number}>();
  const [artError, setArtError] = createSignal("");
  let artCandidate = 0;
  const preloadState = new Map<string,{candidate:number;until:number}>();
  let preloadPending = false;
  function preloadArtwork() {
    if (playing() || controls() || detail() || busy() || dragging || velocity || fetchingMore() ||
        artPending || infoPending || preloadPending || !artWanted || artAttempted !== artWanted ||
        rpc.pending() || artAge < 18) return;
    // Warm the first visible rows on initial open, then follow the selection.
    const neighbors=[page().items[index()+1],page().items[index()+2],page().items[index()-1],
      page().items[0],page().items[1],page().items[2]];
    const item=neighbors.find(item=>item && item.id !== artWanted && (preloadState.get(item.id)?.until ?? 0) <= frame);
    if (!item) return;
    const prior=preloadState.get(item.id), candidate=prior?.candidate ?? 0;
    preloadPending=true;
    const request=rpc.request("jellyfin.command",JSON.stringify({t:"art",id:item.id,fallback:item.artId,candidate,preload:true}),result=> {
      preloadPending=false;
      let next=-1;
      if(result.ok)try { const value=JSON.parse(result.value); if(!value.cached && value.next === 1)next=1; }catch{}
      preloadState.set(item.id,{candidate:next<0?0:next,until:frame+(next<0?1800:60)});
      if(preloadState.size>16)preloadState.delete(preloadState.keys().next().value!);
    });
    if(!request)preloadPending=false;
  }
  let artWanted = "", artAge = 0, artPending = false, artAttempted = "";
  const [metadata, setMetadata] = createSignal<Metadata>({});
  let infoWanted = "", infoAge = 0, infoPending = false, infoAttempted = "";
  const [scrollY, setScrollY] = createSignal(0);
  const [fetchingMore, setFetchingMore] = createSignal(false);
  let scrollTarget = 0, velocity = 0, dragging = false, listGeneration = 0, retryAfter = 0;
  const rowHeight = ROW_HEIGHT, listHeight = 140;
  const maxScroll = () => Math.max(0, page().items.length * rowHeight - listHeight);
  const clampScroll = (value: number) => clampListScroll(value, page().items.length);
  function resetScroll(value = 0) { velocity = 0; dragging = false; scrollTarget = clampScroll(value); setScrollY(scrollTarget); }
  function focusRow(row: number) {
    setIndex(row);
    if (row * rowHeight < scrollTarget) scrollTarget = row * rowHeight;
    else if ((row + 1) * rowHeight > scrollTarget + listHeight) scrollTarget = (row + 1) * rowHeight - listHeight;
    scrollTarget = clampScroll(scrollTarget);
    velocity = 0;
  }
  function nowPlaying() { if (playing()) { setDetail(undefined); setControls(true); setStreamInfo(false); velocity = 0; } }
  function prefetch() {
    if (fetchingMore() || busy() || frame < retryAfter || screen() !== "browser" || controls() || detail()) return;
    const current = page();
    const backwards = scrollY() < 56 && current.offset > 0;
    if (!backwards && (scrollY() < maxScroll() - 84 || current.offset + current.items.length >= current.total)) return;
    const offset = backwards ? Math.max(0, current.offset - PAGE_SIZE) : current.offset + current.items.length;
    const generation = listGeneration;
    setFetchingMore(true);
    const request = rpc.request("jellyfin.command", JSON.stringify({t:"list", ...where(), offset}), result => {
      if (generation !== listGeneration) return;
      setFetchingMore(false);
      if (!result.ok) { retryAfter = frame + 180; setMessage("Could not load more. Scroll to retry."); return; }
      try {
        const next = JSON.parse(result.value) as Page;
        if (!next.items.length) { retryAfter = frame + 300; return; }
        let items = backwards ? [...next.items, ...current.items] : [...current.items, ...next.items];
        let first = backwards ? next.offset : current.offset;
        let shift = backwards ? next.items.length : 0;
        // Keep memory and the back stack bounded on original 3DS systems.
        if (items.length > 40) {
          const excess = items.length - 40;
          if (backwards) items = items.slice(0, 40);
          else { items = items.slice(excess); first += excess; shift -= excess; }
        }
        setPage({items, offset:first, total:next.total});
        setIndex(Math.max(0, index() + shift));
        setScrollY(clampScroll(scrollY() + shift * rowHeight));
        scrollTarget = clampScroll(scrollTarget + shift * rowHeight);
      } catch { retryAfter = frame + 180; }
    });
    if (!request) { setFetchingMore(false); retryAfter = frame + 30; }
  }


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

  function command(commandValue: unknown, done: (value: any) => void, foreground = true, failed?: () => void) {
    if (!rpc.connected()) {
      setMessage("Starting…");
      failed?.();
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
        failed?.();
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
        failed?.();
      }
    });
    if (!id) {
      if (foreground) setBusy(false);
      setMessage("Busy. Try again.");
      failed?.();
    }
  }

  function load(location: Location, selectedIndex = 0) {
    if (busy() || !authenticated()) return;
    listGeneration++; setFetchingMore(false); retryAfter = 0;
    command({ t: "list", ...location }, (data: Page) => {
      setScreen("browser");
      setWhere(location);
      setPage(data);
      setIndex(Math.min(selectedIndex, Math.max(0, data.items.length - 1)));
      resetScroll();
      setDetail(undefined);
      setControls(false);
      setStreamInfo(false);
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
    preloadState.clear();
    command({ t: "login", server: server().trim(), username: username().trim(), password: password() },
      (hello: Hello) => {
        setPassword("");
        setAuthenticated(hello.authenticated);
        setNewModel(hello.newModel);
        setHardwareDecode(Boolean(hello.hardware));
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
    preloadState.clear();
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
      history.push({ location: where(), page: page(), index: index(), scroll: scrollY() });
      load({ mode: "folder", title: item.name, parent: item.id, offset: 0 });
    } else {
      setDetailFocus(0);
      setDetail(item);
      setControls(false);
    }
  }

  function play(item: Item, seconds: number) {
    if (busy()) return;
    player.close();
    setPlaying(item);
    setStatus(undefined);
    setProfile(undefined);
    setSeekPreview(undefined);
    setControls(true);
    setDetail(undefined);
    command({ t: "play", id: item.id, seconds, duration: item.seconds, quality: quality() }, (data) => {
      setPlaying({ ...item, seconds: data.seconds });
      setProfile(data.profile);
      if (!player.open(data.source)) {
        setMessage("Video could not start. Check DSP firmware and server transcoding.");
        command({ t: "stop", seconds }, () => {}, false);
        setPlaying(undefined);
        setControls(false);
        return;
      }
      player.volume(volume());
      if (plane) getOps().setImage(plane.id, player.texture());
    }, true, () => { setPlaying(undefined); setControls(false); setProfile(undefined); });
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
    setStreamInfo(false);
    setProfile(undefined);
    setSeekPreview(undefined);
    command({ t: "stop", seconds }, () => {}, false);
  }

  function nextItem(): Item | undefined {
    const current = playing();
    if (!current) return undefined;
    const items = page().items;
    const at = items.findIndex(item => item.id === current.id);
    if (at < 0) return undefined;
    const next = items[at + 1];
    return next && !next.folder ? next : undefined;
  }

  function pause() {
    if (!playing() || busy()) return;
    if (status()?.phase === "ended") {
      play(nextItem() ?? playing()!, 0);
      return;
    }
    player.pause(status()?.phase !== "paused");
  }

  function seek(delta: number) {
    const item = playing();
    if (item && !busy()) seekTo((status()?.positionMs ?? 0) / 1000 + delta);
  }

  function seekTo(seconds: number) {
    const item = playing();
    if (!item || busy() || item.seconds <= 0) return;
    const target = Math.min(clampPosition(seconds, item.seconds), Math.max(0, item.seconds - 1));
    if (Math.abs(target - (status()?.positionMs ?? 0) / 1000) >= 1) play(item, target);
  }

  function switchQuality(dir = 1) {
    if (busy()) return;
    const order: Quality[] = newModel() ? ["standard", "high", "native"] : ["standard", "high"];
    const next = order[(order.indexOf(quality()) + dir + order.length) % order.length];
    setQuality(next);
    if (playing()) play(playing()!, (status()?.positionMs ?? 0) / 1000);
  }

  function toggleDecoder() {
    if (busy() || !newModel()) return;
    command({ t: "decoder", hardware: !hardwareDecode() }, (reply: { hardware: boolean }) => {
      setHardwareDecode(Boolean(reply.hardware));
      if (playing()) play(playing()!, (status()?.positionMs ?? 0) / 1000);
    });
  }

  function cycleTab(dir: 1 | -1) {
    if (busy() || screen() !== "browser" || controls() || detail()) return;
    const tabs: ("libraries" | "resume" | "search" | "setup")[] = ["libraries", "resume", "search", "setup"];
    const mode = where().mode;
    const cur = mode === "folder" ? "libraries" : mode;
    const next = tabs[(tabs.indexOf(cur) + dir + tabs.length) % tabs.length];
    if (next === "libraries") home("libraries");
    else if (next === "resume") home("resume");
    else if (next === "search") editField("search");
    else showSetup();
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
      if (streamInfo()) { setStreamInfo(false); return; }
      setControls(false);
      return;
    }
    const previous = history.pop();
    if (previous) {
      listGeneration++; setFetchingMore(false);
      setWhere(previous.location); setPage(previous.page); setIndex(previous.index); resetScroll(previous.scroll);
      setDetail(undefined); setControls(false); setMessage("");
    }
    else home("libraries");
  }

  function move(delta: number) {
    if (busy() || screen() !== "browser" || controls() || detail()) return;
    const next = index() + delta;
    if (next >= 0 && next < page().items.length) focusRow(next);
    prefetch();
  }

  function changeVolume(delta: number) {
    setVolume(Math.max(0, Math.min(1, volume() + delta)));
    player.volume(volume());
  }

  function moveDetail(delta: number) {
    const choices = detail()?.resume ? (playing() ? [0, 1, 2, 3] : [0, 1, 2]) : (playing() ? [0, 2, 3] : [0, 2]);
    const position = Math.max(0, choices.indexOf(detailFocus()));
    setDetailFocus(choices[Math.max(0, Math.min(choices.length - 1, position + delta))]);
  }
  function activateDetail() {
    if (!detail() || busy()) return;
    if (detailFocus() === 2) back();
    else if (detailFocus() === 3) nowPlaying();
    else play(detail()!, detailFocus() === 1 ? 0 : detail()!.resume);
  }

  function stepVertical(dir: -1 | 1) {
    if (screen() === "setup") setSetupField(Math.max(0, Math.min(authenticated() ? 4 : 3, setupField() + dir)));
    else if (controls() && streamInfo()) setInfoFocus(Math.max(0, Math.min(2, infoFocus() + dir)));
    else if (controls() && !streamInfo()) changeVolume(dir < 0 ? 0.1 : -0.1);
    else if (detail()) moveDetail(dir);
    else move(dir);
  }

  onButtonPress(BTN.UP, () => stepVertical(-1));
  onButtonPress(BTN.DOWN, () => stepVertical(1));
  onButtonPress(BTN.LEFT, () => {
    if (screen() === "setup" && authenticated() && setupField() >= 3) setSetupField(3);
    else if (screen() === "browser" && controls() && streamInfo()) {
      if (infoFocus() === 0) switchQuality(-1);
      else if (infoFocus() === 1) toggleDecoder();
      else changeVolume(-0.1);
    } else if (screen() === "browser" && controls()) seek(-10);
    else if (screen() === "browser" && detail() && playing() && detailFocus() >= 2) setDetailFocus(2);
    else if (screen() === "browser" && !controls() && !detail()) move(-5);
  });
  onButtonPress(BTN.RIGHT, () => {
    if (screen() === "setup" && authenticated() && setupField() >= 3) setSetupField(4);
    else if (screen() === "browser" && controls() && streamInfo()) {
      if (infoFocus() === 0) switchQuality(1);
      else if (infoFocus() === 1) toggleDecoder();
      else changeVolume(0.1);
    } else if (screen() === "browser" && controls()) seek(10);
    else if (screen() === "browser" && detail() && playing() && detailFocus() >= 2) setDetailFocus(3);
    else if (screen() === "browser" && !controls() && !detail()) move(5);
  });
  onButtonPress(BTN.CIRCLE, () => {
    if (screen() === "setup") editSetupField();
    else if (controls() && streamInfo()) {
      if (infoFocus() === 0) switchQuality(1);
      else if (infoFocus() === 1) toggleDecoder();
      else changeVolume(0.1);
    } else if (controls()) pause();
    else if (detail()) activateDetail();
    else if (page().items[index()]) open(page().items[index()]);
  });
  onButtonPress(BTN.CROSS, back);
  onButtonPress(BTN.TRIANGLE, () => {
    if (screen() !== "browser" || busy()) return;
    if (controls()) setStreamInfo(!streamInfo());
    else editField("search");
  });
  onButtonPress(BTN.SQUARE, () => {
    if (screen() !== "browser" || busy()) return;
    if (controls()) switchQuality(1);
    else home("resume");
  });
  onButtonPress(BTN.START, pause);
  onButtonPress(BTN.SELECT, () => playing() ? (controls() ? setControls(false) : nowPlaying()) : showSetup());
  onButtonPress(BTN.LTRIGGER, () => controls() ? seek(-30) : cycleTab(-1));
  onButtonPress(BTN.RTRIGGER, () => controls() ? seek(30) : cycleTab(1));
  onButtonPress(BTN.ZR, () => { const next = nextItem(); if (controls() && next) play(next, 0); });

  createGesture({
    surface: "auxiliary",
    axis: "y",
    onPanStart: (contact) => {
      dragging = screen() === "browser" && !controls() && !detail() && contact.startY >= 48 && contact.startY < 188;
      velocity = 0;
    },
    onPanMove: (contact) => {
      if (!dragging) return;
      scrollTarget = clampScroll(scrollY() - contact.fdy);
      setScrollY(scrollTarget);
      setIndex(Math.min(page().items.length - 1, Math.max(0, Math.floor((scrollTarget + 56) / rowHeight))));
    },
    onPanEnd: (contact) => {
      if (dragging) velocity = Math.max(-12, Math.min(12, -contact.vy / 60));
      dragging = false;
    },
    onTap: (contact) => {
      if (busy()) return;
      velocity = 0; scrollTarget = scrollY();
      if (screen() === "setup") {
        const chosen = hitTestSetup(contact.x, contact.y, authenticated());
        if (chosen >= 0) {
          setSetupField(chosen);
          editSetupField();
        }
        return;
      }
      if (controls()) {
        const action = hitTestControls(contact.x, contact.y, streamInfo());
        if (action === "closeStream") setStreamInfo(false);
        else if (action === "quality") { setInfoFocus(0); switchQuality(1); }
        else if (action === "decoder") { setInfoFocus(1); toggleDecoder(); }
        else if (action === "volDown") { setInfoFocus(2); changeVolume(-0.1); }
        else if (action === "volUp") { setInfoFocus(2); changeVolume(0.1); }
        else if (action === "seekBack30") seek(-30);
        else if (action === "seekBack") seek(-10);
        else if (action === "pause") pause();
        else if (action === "seekFwd") seek(10);
        else if (action === "seekFwd30") seek(30);
        else if (action === "stream") { setStreamInfo(true); setInfoFocus(0); }
        else if (action === "browse") setControls(false);
        else if (action === "stop") stop();
        return;
      }
      if (contact.y < 32) {
        const target = hitTestNav(contact.x);
        if (target === "libraries") home("libraries");
        else if (target === "resume") home("resume");
        else if (target === "search") editField("search");
        else showSetup();
        return;
      }
      if (!controls() && playing() && contact.y >= 192 && contact.y < 220 && contact.x >= 100) { nowPlaying(); return; }
      if (detail()) {
        const action = hitTestDetail(contact.x, contact.y, detail()!.resume > 0, Boolean(playing()));
        if (action === "resume") play(detail()!, detail()!.resume);
        else if (action === "restart") play(detail()!, 0);
        else if (action === "nowPlaying") nowPlaying();
        else if (action === "back") back();
        return;
      }
      if (contact.y >= 48 && contact.y < 188) {
        const row = Math.floor((contact.y - 48 + scrollY()) / rowHeight);
        const item = page().items[row];
        if (item) {
          if (row === index()) open(item); else setIndex(row);
        }
      }
      if (contact.y >= 192 && contact.y < 220) {
        back();
      }
    },
  });

  // Commit a seek once on release, so dragging never spawns multiple server transcodes.
  createGesture({
    surface: "auxiliary",
    region: { rect: () => controls() && !streamInfo() ? {x:8,y:42,w:304,h:52} : null },
    axis: "x",
    onPanStart: contact => setSeekPreview(seekAtX(contact.x, playing()?.seconds ?? 0)),
    onPanMove: contact => setSeekPreview(seekAtX(contact.x, playing()?.seconds ?? 0)),
    onPanEnd: contact => { const target=seekAtX(contact.x, playing()?.seconds ?? 0); setSeekPreview(undefined); seekTo(target); },
    onCancel: () => setSeekPreview(undefined),
    onTap: contact => seekTo(seekAtX(contact.x, playing()?.seconds ?? 0)),
  });

  onFrame((buttons) => {
    frame++;
    const ay = analogY();
    const heldDir = (buttons & BTN.UP) || ay < -0.55 ? -1 : (buttons & BTN.DOWN) || ay > 0.55 ? 1 : 0;
    if (heldDir !== 0 && heldDir === navDir) {
      navHold++;
      if (navHold >= 16 && (navHold - 16) % 5 === 0) stepVertical(heldDir);
    } else {
      navDir = heldDir;
      navHold = heldDir !== 0 && Math.abs(ay) > 0.55 && !(buttons & (BTN.UP | BTN.DOWN)) ? 16 : 0;
    }
    if (!dragging && !controls() && !detail()) {
      if (Math.abs(velocity) > 0.15) {
        const next = clampScroll(scrollY() + velocity);
        if (next === scrollY()) velocity = 0;
        setScrollY(next); scrollTarget = next; velocity *= 0.90;
        setIndex(Math.min(page().items.length - 1, Math.max(0, Math.floor((next + 56) / rowHeight))));
      } else {
        velocity = 0;
        const difference = scrollTarget - scrollY();
        if (Math.abs(difference) > 0.25) setScrollY(scrollY() + difference * 0.3);
        else if (difference) setScrollY(scrollTarget);
      }
    }
    prefetch();
    const infoKey = screen() === "browser" && !controls() ? selected()?.id ?? "" : "";
    if (infoKey !== infoWanted) { infoWanted = infoKey; infoAge = 0; infoAttempted = ""; setMetadata({}); }
    infoAge++;
    if (infoKey && infoAge >= 8 && !dragging && !velocity && !infoPending && !busy() && !fetchingMore() && rpc.pending() === 0 && infoAttempted !== infoKey) {
      const key = infoKey; infoPending = true;
      const id = rpc.request("jellyfin.command", JSON.stringify({t:"info", id:key}), result => {
        infoPending = false;
        if (key !== infoWanted || !result.ok) return;
        try { setMetadata(JSON.parse(result.value)); } catch { /* Metadata is optional. */ }
      });
      if (id) infoAttempted = key; else infoPending = false;
    }
    const wanted = !playing() && screen() === "browser" ? selected()?.id ?? "" : "";
    if (wanted !== artWanted) { artWanted = wanted; artAge = 0; artAttempted = ""; artCandidate = 0; setArtError("Loading artwork…"); setArt(undefined); }
    artAge++;
    if (wanted && artAge >= 18 && !artPending && !infoPending && !dragging && !velocity && !busy() && !fetchingMore() && rpc.pending() === 0 && rpc.connected() && artAttempted !== wanted) {
      artPending = true;
      const key = wanted;
      const request = rpc.request("jellyfin.command", JSON.stringify({t:"art", id:key, candidate:artCandidate, fallback:metadata().artId ?? selected()?.artId}), result => {
        artPending = false;
        if (key !== artWanted) return;
        if (!result.ok) { setArtError("Artwork request failed"); return; }
        try {
          const value = JSON.parse(result.value);
          if (value.handle >= 0) {
            setArt(value); setArtError("");
            if (artPlane) getOps().setImage(artPlane.id, value.handle);
          } else if (Number.isInteger(value.next) && value.next >= 0 && value.next < 6) {
            artCandidate = value.next; artAttempted = ""; artAge = 0;
          } else setArtError(value.error || "No artwork");
        } catch { /* Keep the placeholder when artwork is missing. */ }
      });
      if (request) artAttempted = wanted; else artPending = false;
    }

    preloadArtwork();
    const current = rpc.session();
    if (current !== session) {
      preloadState.clear();
      operation++; listGeneration++; setFetchingMore(false);
      infoWanted = artWanted = infoAttempted = artAttempted = ""; setArt(undefined); setMetadata({});
      setBusy(false);
      setProviderReady(current > 0);
      setNewModel(false);
      player.close();
      setPlaying(undefined);
      setStatus(undefined);
      setControls(false);
      setStreamInfo(false);
      setProfile(undefined);
      session = current;
      if (current > 0) {
        command({ t: "hello" }, (hello: Hello) => {
          setServer(hello.server || "http://");
          setUsername(hello.username || "");
          setAuthenticated(hello.authenticated);
          setNewModel(hello.newModel);
          setHardwareDecode(Boolean(hello.hardware));
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
    if (frame % (controls() ? 6 : 30) === 0 && playing()) {
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
  const visibleRows = () => page().items.slice(Math.floor(scrollY() / rowHeight), Math.floor(scrollY() / rowHeight) + 6);
  const subtitle = () => [metadata().series, metadata().episode ? `S${metadata().season ?? 0} E${metadata().episode}` : "", selected()?.year, metadata().rating, selected()?.seconds ? `${Math.round(selected()!.seconds / 60)} min` : "", metadata().genre].filter(Boolean).join(" · ");
  const overview = () => (metadata().overview ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const playbackSeconds = () => seekPreview() ?? (status()?.positionMs ?? 0) / 1000;
  const durationSeconds = () => playing()?.seconds ?? 0;
  const videoSize = () => (status()?.videoWidth && status()?.videoHeight)
    ? `${status()!.videoWidth}×${status()!.videoHeight}` : "Waiting for video";
  const passwordLabel = () => password().length ? "*".repeat(Math.min(24, password().length)) : "Password";
  const videoRect = () => {
    const width = Math.max(1, status()?.videoWidth || 400);
    const height = Math.max(1, status()?.videoHeight || 240);
    const scale = Math.min(400 / width, 240 / height);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    return { x: Math.floor((400 - w) / 2), y: Math.floor((240 - h) / 2), w, h };
  };

  return <>
    <View class="relative w-full h-full bg-[#0f131b] overflow-hidden">
      <Show when={playing()}><View class="absolute inset-0 bg-black" /></Show>
      <Image
        nodeRef={(node) => { plane = node; getOps().setImage(node.id, player.texture()); }}
        class="absolute"
        style={{ insetL: videoRect().x, insetT: videoRect().y, width: videoRect().w,
          height: videoRect().h, opacity: playing() && (status()?.presentedFrames ?? 0) > 0 ? 1 : 0 }}
      />
      <Show when={!playing() && screen() === "setup"}>
        <View class="absolute left-[12] top-[12] right-[12] bottom-[18] rounded-xl bg-[#161c28] border border-[#2a3448]">
          <Text class="absolute left-[14] top-[14] text-sm text-[#d8b4fe] font-bold">Jellyfin3DS</Text>
          <Text class="absolute right-[14] top-[14] text-xs text-[#94a3b8]">{newModel() ? "New 3DS · 804 MHz" : "Nintendo 3DS"}</Text>
          <Text class="absolute left-[14] top-[42] text-lg text-[#f1f5f9] font-bold">Account</Text>
          <View class="absolute left-[14] top-[77] h-[2] w-[88] bg-[#a855f7]" />
          <Text class="absolute left-[14] top-[94] text-base text-[#cbd5e1]">Sign in below to connect to your Jellyfin server.</Text>
          <Text class="absolute left-[14] bottom-[16] text-xs text-[#94a3b8]">
            {server().startsWith("https://") ? "TLS certificate verification enabled" : "LAN HTTP mode"}
          </Text>
        </View>
      </Show>
      <Show when={!playing() && screen() === "browser"}>
        <View class="absolute left-[12] top-[8] right-[12] bottom-[10] rounded-xl bg-[#161c28] border border-[#2a3448]">
          <View class="absolute left-[10] top-[10] w-[178] h-[100] rounded-lg bg-[#1f283a] overflow-hidden items-center justify-center">
            <Text class="text-xs text-[#94a3b8]">{art() ? "" : artError() || selected()?.type || "Library"}</Text>
            <Image nodeRef={node => { artPlane = node; if (art()) getOps().setImage(node.id, art()!.handle); }}
              class="absolute top-0" style={{insetL:0,width:178,height:178,opacity:art()?1:0}} />
          </View>
          <Text class="absolute left-[198] right-[10] top-[12] text-sm text-[#f1f5f9] font-bold">{label(selected()?.name ?? "Library", 28)}</Text>
          <Text class="absolute left-[198] right-[10] top-[52] text-xs text-[#d8b4fe]">{subtitle().slice(0, 60)}</Text>
          <Text class="absolute left-[198] right-[10] top-[88] text-xs text-[#94a3b8]">{selected()?.played ? "Watched" : selected()?.resume ? `Resume ${time(selected()!.resume)}` : selected()?.type ?? ""}</Text>
          <View class="absolute left-[10] right-[10] top-[118] h-[1] bg-[#2a3448]" />
          <Text class="absolute left-[10] right-[10] top-[125] text-xs text-[#cbd5e1]">{overview().length > 210 ? overview().slice(0, 207) + "..." : overview()}</Text>
        </View>
      </Show>
      <Show when={screen() === "boot"}>
        <View class="absolute inset-0 items-center justify-center flex-col gap-2">
          <Text class="text-lg text-[#f1f5f9] font-bold">Jellyfin3DS</Text>
          <View class="w-[64] h-[48] rounded-xl bg-[#a855f7] items-center justify-center"><Text class="text-lg text-white font-bold">Play</Text></View>
          <Text class="text-xs text-[#94a3b8]">Starting…</Text>
        </View>
      </Show>
      <Show when={message() && message() !== "Loading…" && (!playing() || status()?.phase === "error")}>
        <View class="absolute left-[20] right-[20] bottom-[30] p-[8] rounded-lg bg-[#2b2210] border border-[#eab308]"><Text class="text-xs text-[#fef08a]">{message()}</Text></View>
      </Show>
      <Show when={playing() && !(status()?.presentedFrames)}>
        <View class="absolute inset-0 items-center justify-center flex-col gap-1">
          <Text class="text-sm text-[#d8b4fe] font-bold">{label(playing()?.name ?? "")}</Text>
          <Text class="text-base text-[#f1f5f9]">{status()?.phase === "error" ? "Playback unavailable" : "Buffering…"}</Text>
          <Show when={profile()}>
            <Text class="text-xs text-[#d8b4fe]">{profile()!.maxWidth}×{profile()!.maxHeight} · {profile()!.maxFps} fps · {profile()!.hardware ? "MVD" : "CPU"}</Text>
          </Show>
        </View>
      </Show>
    </View>

    <AuxiliarySurface>{() => <View class={controls() ? "relative w-full h-full bg-[#0b0e14] overflow-hidden" : "relative w-full h-full bg-[#0f131b] overflow-hidden"}>
      <Show when={screen() === "setup"}>
        <SetupView
          setupField={setupField()}
          server={server()}
          username={username()}
          passwordLabel={passwordLabel()}
          authenticated={authenticated()}
          providerReady={providerReady()}
        />
      </Show>

      <Show when={screen() === "browser"}>
        <Show when={!controls()}>
          <NavBar mode={where().mode} />
        </Show>
        <Show when={!controls() && !detail()}>
          <BrowserListView
            title={history.length ? `${history[history.length - 1].location.title} › ${where().title}` : where().title}
            page={page()}
            index={index()}
            scrollY={scrollY()}
            rowHeight={rowHeight}
            visibleRows={visibleRows()}
            busy={busy()}
            mode={where().mode}
            fetchingMore={fetchingMore()}
            playing={Boolean(playing())}
          />
        </Show>
        <Show when={detail() && !controls()}>
          <DetailView
            item={detail()!}
            detailFocus={detailFocus()}
            overview={overview()}
            playing={Boolean(playing())}
          />
        </Show>
        <Show when={controls()}>
          <PlayerControlsView
            streamInfo={streamInfo()}
            title={playing()?.name ?? ""}
            phase={status()?.phase ?? "Opening"}
            videoSize={videoSize()}
            displayFps={status()?.displayFps}
            decodeFps={status()?.decodeFps}
            profile={profile()}
            playbackSeconds={playbackSeconds()}
            durationSeconds={durationSeconds()}
            seeking={seekPreview() !== undefined}
            infoFocus={infoFocus()}
            quality={quality()}
            hardwareDecode={hardwareDecode()}
            newModel={newModel()}
            volume={volume()}
            hasNext={Boolean(nextItem())}
          />
        </Show>
        <Text class="absolute left-[6] top-[223] text-xs text-[#94a3b8]">
          {label(message() || (controls() ? streamInfo() ? "Up/Down: Select · A/L/R: Change · B: Back" : "A: Play/Pause · L/R: ±30s · Up/Down: Vol · X: Stream" : "A: Open · L/R: Tabs · X: Search · Y: Continue"), 48)}
        </Text>
      </Show>

    </View>}</AuxiliarySurface>
  </>;
}

mount(() => <App />);
