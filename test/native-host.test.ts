import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  transformGfx,
  transformMakefile,
  transformMediaHeader,
  transformVideoHeader,
  transformVideoSource,
} from "../scripts/native-host.ts";

const host = "vendor/pocketjs/hosts/3ds";
const reference = "vendor/jellyfin-3ds";

test("native host patch replaces companion transport with direct libraries", () => {
  const makefile = transformMakefile(readFileSync(`${host}/Makefile`, "utf8"));
  expect(makefile).toContain("/out/native/offload.c");
  expect(makefile).toContain("-lavformat");
  expect(makefile).toContain("-lcurl");
  expect(makefile).toContain("$(ROMFS)/cacert.pem");
  expect(makefile).not.toContain("\n+");
});

test("native decoder keeps authentication in a header and verifies TLS", () => {
  const source = transformVideoSource(
    readFileSync(`${reference}/src/video/video_player.c`, "utf8"),
  );
  expect(source).toContain("X-Emby-Token: %s");
  expect(source).toContain("CURLOPT_SSL_VERIFYPEER, 1L");
  expect(source).toContain('CURLOPT_CAINFO, "romfs:/cacert.pem"');
  expect(source).not.toContain("CURLOPT_SSL_VERIFYPEER, 0L");
  expect(source).toContain("video_player_texture");
});

test("PocketJS texture seam carries the decoded frame bounds", () => {
  const header = transformMediaHeader(readFileSync(`${host}/src/media.h`, "utf8"));
  const gfx = transformGfx(readFileSync(`${host}/src/gfx.c`, "utf8"));
  const videoHeader = transformVideoHeader(
    readFileSync(`${reference}/include/video/video_player.h`, "utf8"),
  );
  expect(header).toContain("float *u_scale, float *v_scale");
  expect(gfx).toContain("media_texture(handle, u_scale, v_scale)");
  expect(videoHeader).toContain("C3D_Tex *video_player_texture");
});
