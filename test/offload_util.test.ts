import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";

test("offload URL, ID, token validation and UTF-8 truncation stay bounded", async () => {
  mkdirSync(".pocket-build/validation", { recursive: true });
  const binary = ".pocket-build/validation/offload_util";
  expect(
    await Bun.spawn(
      ["cc", "-Wall", "-Wextra", "-fsanitize=address,undefined", "test/offload_util.c", "-o", binary],
      { stdout: "inherit", stderr: "inherit" },
    ).exited,
  ).toBe(0);
  expect(await Bun.spawn([binary], { stdout: "inherit", stderr: "inherit" }).exited).toBe(0);
});
