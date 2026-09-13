import {mkdirSync,copyFileSync,writeFileSync,readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";
const out="dist/install";mkdirSync(`${out}/3ds/Jellyfin3DS`,{recursive:true});mkdirSync(`${out}/cias`,{recursive:true});
for(const [ext,path] of [["3dsx",`${out}/3ds/Jellyfin3DS/Jellyfin3DS.3dsx`],["cia",`${out}/cias/Jellyfin3DS.cia`]]){
 const source=`dist/3ds/Jellyfin3DS.${ext}`;if(!existsSync(source))throw new Error(`Missing ${source}; run bun run build`);copyFileSync(source,path);
}
copyFileSync("INSTALL.md",`${out}/INSTALL.md`);
const files=["3ds/Jellyfin3DS/Jellyfin3DS.3dsx","cias/Jellyfin3DS.cia"];
writeFileSync(`${out}/SHA256SUMS`,files.map(p=>`${createHash("sha256").update(readFileSync(`${out}/${p}`)).digest("hex")}  ${p}`).join("\n")+"\n");
