import {test,expect} from "bun:test";
import {mkdirSync} from "node:fs";
test("MVD receives converted addresses and individual complete NAL units",async()=>{
  mkdirSync(".pocket-build/validation",{recursive:true});
  const output=".pocket-build/validation/mvd-transport";
  const compile=Bun.spawn(["cc","-Itest/mvd-stubs","-Ivendor/jellyfin-3ds/include","test/mvd-transport.c","-o",output],{stdout:"inherit",stderr:"inherit"});
  expect(await compile.exited).toBe(0);
  expect(await Bun.spawn([output],{stdout:"inherit",stderr:"inherit"}).exited).toBe(0);
});
