import {mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
const out="dist/install";mkdirSync(`${out}/3ds/Jellyfin3DS`,{recursive:true});mkdirSync(`${out}/cias`,{recursive:true});
for(const [ext,path] of [["3dsx",`${out}/3ds/Jellyfin3DS/Jellyfin3DS.3dsx`],["cia",`${out}/cias/Jellyfin3DS.cia`]]){
 const source=`dist/3ds/Jellyfin3DS.${ext}`;if(!existsSync(source))throw new Error(`Missing ${source}; run bun run build`);copyFileSync(source,path);
}
copyFileSync("INSTALL.md",`${out}/INSTALL.md`);
copyFileSync("assets/fbi-install.png",`${out}/FBI-QR.png`);
copyFileSync("assets/fbi-install-url.txt",`${out}/FBI-URL.txt`);
const files=["3ds/Jellyfin3DS/Jellyfin3DS.3dsx","cias/Jellyfin3DS.cia"];
writeFileSync(`${out}/SHA256SUMS`,files.map(p=>`${createHash("sha256").update(readFileSync(`${out}/${p}`)).digest("hex")}  ${p}`).join("\n")+"\n");

mkdirSync(`${out}/licenses`,{recursive:true});
copyFileSync("vendor/pocketjs/LICENSE",`${out}/licenses/PocketJS.txt`);
copyFileSync("vendor/pocketjs/assets/fonts/LICENSE.txt",`${out}/licenses/Inter-OFL.txt`);
copyFileSync("vendor/jellyfin-3ds/LICENSE",`${out}/licenses/GPL-3.0.txt`);
copyFileSync("THIRD_PARTY.md",`${out}/licenses/THIRD_PARTY.md`);
copyFileSync(".pocket/banner/tool/LICENSE.txt",`${out}/licenses/bannertool.txt`);
