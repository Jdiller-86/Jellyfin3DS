import { expect, test } from "bun:test";
import { clampPosition, progressWidth, seekAtX } from "../app/stream.ts";

test("timeline seeks only inside the media duration, including track ends", () => {
  expect(seekAtX(16, 600)).toBe(0);
  expect(seekAtX(160, 600)).toBe(300);
  expect(seekAtX(304, 600)).toBe(600);
  expect(seekAtX(-100, 600)).toBe(0);
  expect(seekAtX(500, 600)).toBe(600);
  expect(clampPosition(NaN, 600)).toBe(0);
  expect(seekAtX(150, 0)).toBe(0);
  expect(progressWidth(300, 600)).toBe(144);
  expect(progressWidth(900, 600)).toBe(288);
});
