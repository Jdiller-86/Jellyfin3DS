import {test, expect} from "bun:test";
import {mkdirSync} from "node:fs";

test("native screen preset respects model and decoder safety limits", async () => {
  mkdirSync(".pocket-build/validation", {recursive:true});
  const binary=".pocket-build/validation/stream_profile";
  expect(await Bun.spawn(["cc","-Wall","-Wextra","-fsanitize=address,undefined","test/stream_profile.c","-o",binary],{stdout:"inherit",stderr:"inherit"}).exited).toBe(0);
  expect(await Bun.spawn([binary],{stdout:"inherit",stderr:"inherit"}).exited).toBe(0);
});
