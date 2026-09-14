import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appIcon } from "./icons.ts";
import { resolve } from "node:path";
import { resolve3dsBuildPlan } from "../vendor/pocketjs/tools/3ds-profile.ts";
import { build3ds } from "../vendor/pocketjs/tools/3ds.ts";
import { stageNativeHost } from "./native-host.ts";
const root = resolve(import.meta.dir, "..");
const plan = resolve3dsBuildPlan(JSON.parse(readFileSync(resolve(root,"pocket.json"), "utf8")));
mkdirSync(resolve(root,".pocket"), {recursive:true});
const planPath=resolve(root,".pocket/plan.json");
writeFileSync(planPath, JSON.stringify(plan));
const iconPaths=[resolve(root,"vendor/pocketjs/hosts/3ds/icon.png"),resolve(root,"vendor/pocketjs/hosts/3ds/icon-small.png")];
const originals=iconPaths.map(p=>readFileSync(p));
const pocketOnly=process.argv.includes("--pocket-only");
const nativeStage=pocketOnly?undefined:stageNativeHost(root);
try {
  if(!pocketOnly)iconPaths.forEach((p,i)=>writeFileSync(p,appIcon(i?24:48)));
  await build3ds([`--plan=${planPath}`, `--manifest=${root}/pocket.json`, `--project-root=${root}`, ...process.argv.slice(2)]);
} finally {
  iconPaths.forEach((p,i)=>writeFileSync(p,originals[i]));
  nativeStage?.restore();
}
mkdirSync(resolve(root,"dist/3ds"), {recursive:true});
const extensions=["pocket", ...(!pocketOnly?["3dsx"]:[]), ...(process.argv.includes("--cia")?["cia"]:[])];
for(const ext of extensions) copyFileSync(resolve(root,`vendor/pocketjs/dist/3ds/jellyfin3ds.${ext}`),resolve(root,`dist/3ds/Jellyfin3DS.${ext}`));
