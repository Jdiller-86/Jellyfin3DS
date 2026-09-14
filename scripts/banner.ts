import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appIcon } from "./icons.ts";

// Original artwork and synthesized chime, matching the app's silver/cyan theme.
export async function buildBanner(root: string) {
  GlobalFonts.registerFromPath(join(root,"vendor/pocketjs/assets/fonts/Inter-Regular.ttf"),"Jellyfin UI");
  GlobalFonts.registerFromPath(join(root,"vendor/pocketjs/assets/fonts/Inter-Bold.ttf"),"Jellyfin UI");
  const dir = join(root, ".pocket/banner");
  mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(256, 128), c = canvas.getContext("2d");
  const background = c.createLinearGradient(0, 0, 0, 128);
  background.addColorStop(0, "#ffffff"); background.addColorStop(1, "#dce4eb");
  c.fillStyle = background; c.fillRect(0, 0, 256, 128);
  c.strokeStyle = "#e0e6eb";
  for (let x = 0; x < 256; x += 16) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,128); c.stroke(); }
  c.drawImage(await loadImage(appIcon(48)), 104, 10);
  c.textAlign = "center"; c.fillStyle = "#3c4954"; c.font = 'bold 26px "Jellyfin UI"';
  c.fillText("Jellyfin3DS", 128, 88);
  c.fillStyle = "#75409b"; c.font = '12px "Jellyfin UI"';
  writeFileSync(join(dir, "banner.png"), canvas.toBuffer("image/png"));
  const rate = 22050, count = rate, wav = Buffer.alloc(44 + count * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34); wav.write("data",36); wav.writeUInt32LE(count*2,40);
  for (let i=0; i<count; ++i) {
    const t=i/rate;
    const sample=[523.25,659.25,783.99].reduce((sum,f,j)=> {
      const u=t-j*0.12;
      return sum+(u<0?0:Math.sin(2*Math.PI*f*u)*Math.min(1,u/0.015)*Math.exp(-7*u));
    },0);
    wav.writeInt16LE(Math.round(sample*3500),44+i*2);
  }
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
