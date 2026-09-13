import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
const index=process.argv.indexOf("--sd"),sd=index<0?undefined:process.argv[index+1];
if(!sd||!existsSync(sd))throw new Error("Usage: bun run pair --sd <mounted SD card or existing staging folder>");
const slot=createHash("sha256").update("com.jdiller86.jellyfin3ds").digest("hex").slice(0,16);
const local=".pocket/offload.key",remote=join(resolve(sd),"pocketjs/offload",`${slot}.key`);
const read=(p:string)=>existsSync(p)?readFileSync(p,"utf8").trim():undefined;
const a=read(local),b=read(remote);if(a&&b&&a!==b)throw new Error("Pairing keys differ; preserved both. Use the companion matching this SD card.");
const key=b??a??randomBytes(32).toString("hex");if(!/^[0-9a-f]{64}$/.test(key))throw new Error("Invalid existing key; preserved");
mkdirSync(".pocket",{recursive:true});mkdirSync(join(resolve(sd),"pocketjs/offload"),{recursive:true});
writeFileSync(local,key+"\n",{mode:0o600});writeFileSync(remote,key+"\n");
const binary="dist/3ds/Jellyfin3DS.3dsx";
if(existsSync(binary)){mkdirSync(join(sd,"3ds/Jellyfin3DS"),{recursive:true});copyFileSync(binary,join(sd,"3ds/Jellyfin3DS/Jellyfin3DS.3dsx"));}
console.log("Paired. Keep .pocket/offload.key on this computer. Eject the SD card before launching Jellyfin3DS.");
