import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Official service artwork, a clearly unofficial client label, and silent banner audio.
export async function buildBanner(root: string) {
  GlobalFonts.registerFromPath(join(root,"vendor/pocketjs/assets/fonts/Inter-Regular.ttf"),"Jellyfin UI");
  GlobalFonts.registerFromPath(join(root,"vendor/pocketjs/assets/fonts/Inter-Bold.ttf"),"Jellyfin UI");
  const dir = join(root, ".pocket/banner");
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(256, 128), c = canvas.getContext("2d");
  const background = c.createLinearGradient(0, 0, 0, 128);
  background.addColorStop(0, "#171422"); background.addColorStop(1, "#101018");
  c.fillStyle = background; c.fillRect(0, 0, 256, 128);
  c.drawImage(await loadImage(readFileSync(join(root,"assets/jellyfin/icon.svg"))), 106, 6, 44, 44);
  c.textAlign = "center"; c.fillStyle = "#ffffff"; c.font = 'bold 25px "Jellyfin UI"';
  c.fillText("Jellyfin3DS", 128, 82);
  c.fillStyle = "#c1a4d4"; c.font = '11px "Jellyfin UI"';
  const version = JSON.parse(readFileSync(join(root,"pocket.json"),"utf8")).version;
  c.fillText(`Unofficial client · v${version}`,128,108);
  writeFileSync(join(dir, "banner.png"), canvas.toBuffer("image/png"));
  const rate = 22050, count = rate * 2, wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34); wav.write("data",36); wav.writeUInt32LE(count*2,40);
  // Keep a valid non-looping CWAV but emit silence: no synthetic beeping.
  // The console's own HOME Menu launch sound is outside this app's control.
  writeFileSync(join(dir,"banner.wav"),wav);
  const source=join(dir,"tool"), executable=join(dir,"bannertool");
  async function run(cmd:string[], cwd=root) {
    const p=Bun.spawn(cmd,{cwd,stdout:"inherit",stderr:"inherit"});
    if(await p.exited) throw new Error(`Banner tool failed: ${cmd[0]}`);
  }
  if(!existsSync(executable)) {
    if(!existsSync(join(source,".git"))) await run(["git","clone","https://github.com/carstene1ns/3ds-bannertool.git",source]);
    await run(["git","checkout","734d33be79fd3f8c29c6296158f06ac7c5ca9dcb"],source);
    await run(["g++","-std=c++17","-O2",'-DVERSION="1.2.3"',"-Isource","-Isource/pc",
      "source/main.cpp","source/log.cpp","source/types.cpp","source/utils.cpp",
      "source/3ds/cbmd.cpp","source/3ds/cwav.cpp","source/3ds/lz11.cpp",
      "source/pc/stb_image.cpp","source/pc/stb_vorbis.cpp","source/pc/dr_wav.cpp","-o",executable],source);
  }
  await run([executable,"makebanner","-i",join(dir,"banner.png"),"-a",join(dir,"banner.wav"),"-o",join(dir,"banner.bnr")]);
}
