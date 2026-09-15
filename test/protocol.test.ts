import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PAGE_SIZE, time } from "../app/protocol.ts";

test("the 3DS page and clock formats stay bounded", () => {
  expect(PAGE_SIZE).toBe(5);
  expect(time(0)).toBe("0:00");
  expect(time(3723.9)).toBe("62:03");
  expect(time(-50)).toBe("0:00");
});

test("native source never embeds the Jellyfin token in its stream URL", () => {
  const source = readFileSync("native/offload.c", "utf8");
  const app = readFileSync("app/main.tsx", "utf8");
  expect(source).not.toContain("api_key=");
  expect(source).toContain("direct_media_prepare(url, config.token");
  expect(app).toContain("Password");
});
