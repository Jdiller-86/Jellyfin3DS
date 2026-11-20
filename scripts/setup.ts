import { mkdirSync, existsSync, symlinkSync } from "node:fs";
const run = async (cmd: string[], cwd = process.cwd()) => { const p = Bun.spawn(cmd, {cwd, stdout:"inherit", stderr:"inherit"}); if(await p.exited) throw new Error("Setup failed"); };
await run(["git", "submodule", "update", "--init", "--recursive"]);
await run(["bun", "install", "--frozen-lockfile"], "vendor/pocketjs");
mkdirSync("node_modules", {recursive:true});
for(const name of ["solid-js", "opentype.js", "@napi-rs", "bun-types", "typescript", "@types"]) {
  if(!existsSync(`node_modules/${name}`)) symlinkSync(`../vendor/pocketjs/node_modules/${name}`, `node_modules/${name}`, "junction");
}
