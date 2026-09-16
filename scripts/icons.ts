import {createCanvas, loadImage} from "@napi-rs/canvas";
import {readFileSync} from "node:fs";
// Unmodified Jellyfin service mark from jellyfin/jellyfin-ux; attribution in assets/jellyfin.
export async function appIcon(size:number):Promise<Buffer> {
  const canvas=createCanvas(size,size), c=canvas.getContext("2d");
  c.fillStyle="#101018"; c.fillRect(0,0,size,size);
  const logo=await loadImage(readFileSync(new URL("../assets/jellyfin/icon.svg",import.meta.url)));
  c.drawImage(logo,size/12,size/12,size*5/6,size*5/6);
  return canvas.toBuffer("image/png");
}
