// Original vector drawing; no Nintendo/Jellyfin logo assets are copied.
import {createCanvas} from "@napi-rs/canvas";
export function appIcon(size:number):Buffer {
 const canvas=createCanvas(size,size),c=canvas.getContext("2d");c.scale(size/48,size/48);
 c.fillStyle="#eff2f5";c.fillRect(0,0,48,48);
 const tile=c.createLinearGradient(0,3,0,45);tile.addColorStop(0,"#ffffff");tile.addColorStop(1,"#dce4eb");c.fillStyle=tile;c.beginPath();c.roundRect(2,2,44,44,9);c.fill();c.strokeStyle="#b5c1cc";c.lineWidth=1;c.stroke();
 c.fillStyle="#aa5cc3";c.beginPath();c.roundRect(8,9,32,26,5);c.fill();
 c.fillStyle="#ffffff";c.beginPath();c.moveTo(20,15);c.lineTo(31,22);c.lineTo(20,29);c.closePath();c.fill();
 c.fillStyle="#8e9ba6";c.beginPath();c.roundRect(15,38,18,3,1.5);c.fill();
 return canvas.toBuffer("image/png");
}
