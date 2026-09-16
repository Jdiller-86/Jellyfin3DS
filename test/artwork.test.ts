import {test,expect} from "bun:test";
import {mkdirSync} from "node:fs";
test("artwork fits accepted textures, preserves aspect ratio and bounds reads", async()=> {
 mkdirSync(".pocket-build/validation",{recursive:true});
 const path=".pocket-build/validation/artwork";
 expect(await Bun.spawn(["cc","-Wall","-Wextra","-fsanitize=address,undefined","test/artwork.c","-o",path],{stdout:"inherit",stderr:"inherit"}).exited).toBe(0);
 expect(await Bun.spawn([path],{stdout:"inherit",stderr:"inherit"}).exited).toBe(0);
});
