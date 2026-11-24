import { expect, test } from "bun:test";
import {
  clampScroll,
  hitTestControls,
  hitTestDetail,
  hitTestNav,
  hitTestSetup,
} from "../app/ui.ts";

test("scroll clamping and touch hitboxes match screen layouts", () => {
  expect(clampScroll(-10, 10)).toBe(0);
  expect(clampScroll(500, 10)).toBe(140);
  expect(clampScroll(50, 3)).toBe(0);

  expect(hitTestSetup(70, 60, false)).toBe(0);
  expect(hitTestSetup(70, 145, false)).toBe(2);
  expect(hitTestSetup(200, 190, false)).toBe(3);
  expect(hitTestSetup(200, 190, true)).toBe(4);

  expect(hitTestNav(40)).toBe("libraries");
  expect(hitTestNav(120)).toBe("resume");
  expect(hitTestNav(200)).toBe("search");
  expect(hitTestNav(280)).toBe("setup");

  expect(hitTestDetail(100, 90, true, false)).toBe("resume");
  expect(hitTestDetail(100, 140, false, false)).toBeNull();
  expect(hitTestDetail(100, 140, true, false)).toBe("restart");
  expect(hitTestDetail(100, 190, true, true)).toBe("back");
  expect(hitTestDetail(220, 190, true, true)).toBe("nowPlaying");

  expect(hitTestControls(36, 120, false)).toBe("seekBack30");
  expect(hitTestControls(96, 120, false)).toBe("seekBack");
  expect(hitTestControls(160, 120, false)).toBe("pause");
  expect(hitTestControls(220, 120, false)).toBe("seekFwd");
  expect(hitTestControls(280, 120, false)).toBe("seekFwd30");
  expect(hitTestControls(80, 164, false)).toBe("volDown");
  expect(hitTestControls(240, 164, false)).toBe("volUp");
  expect(hitTestControls(56, 200, false)).toBe("stream");
  expect(hitTestControls(160, 200, false)).toBe("browse");
  expect(hitTestControls(266, 200, false)).toBe("stop");
  expect(hitTestControls(266, 120, true)).toBe("quality");
  expect(hitTestControls(266, 160, true)).toBe("decoder");
  expect(hitTestControls(80, 200, true)).toBe("volDown");
  expect(hitTestControls(240, 200, true)).toBe("volUp");
  expect(hitTestControls(280, 16, true)).toBe("closeStream");
});
