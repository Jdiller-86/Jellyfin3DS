import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { THREE_DS_CONTAINER_IMAGE } from "../vendor/pocketjs/tools/3ds-toolchain.ts";

const root = resolve(import.meta.dir, "..");
const required = [
  ".pocket/native/cacert.pem",
  ".pocket/native/portlibs/lib/libcurl.a",
  ".pocket/native/portlibs/include/curl/curl.h",
  "vendor/jellyfin-3ds/lib/ffmpeg/libavformat.a",
  "vendor/jellyfin-3ds/lib/ffmpeg/libavcodec.a",
  "vendor/jellyfin-3ds/lib/ffmpeg/libswresample.a",
  "vendor/jellyfin-3ds/lib/ffmpeg/libavutil.a",
  "vendor/jellyfin-3ds/lib/ffmpeg/include/libavformat/avformat.h",
];

if (required.every((path) => existsSync(resolve(root, path)))) {
  console.log("Native 3DS dependencies are ready.");
  process.exit(0);
}
if (!Bun.which("docker")) {
  throw new Error("Docker is required to prepare the pinned 3DS native dependencies");
}
mkdirSync(resolve(root, ".pocket/native/portlibs"), { recursive: true });

async function run(command: string[]) {
  const child = Bun.spawn(command, { cwd: root, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`Native dependency command failed (${code})`);
}

await run(["docker", "pull", THREE_DS_CONTAINER_IMAGE]);
await run([
  "docker", "run", "--rm",
  "-v", `${root}:/out`,
  "-w", "/out",
  THREE_DS_CONTAINER_IMAGE,
  "bash", "-lc",
  [
    "set -euo pipefail",
    "dkp-pacman -S --noconfirm --needed 3ds-curl 3ds-mbedtls 3ds-zlib",
    "mkdir -p /out/.pocket/native/portlibs",
    "cp -a /opt/devkitpro/portlibs/3ds/. /out/.pocket/native/portlibs/",
    "cp /etc/ssl/certs/ca-certificates.crt /out/.pocket/native/cacert.pem",
    "test -f /out/vendor/jellyfin-3ds/lib/ffmpeg/libavformat.a || bash /out/vendor/jellyfin-3ds/lib/ffmpeg/build-ffmpeg.sh",
  ].join("\n"),
]);

const missing = required.filter((path) => !existsSync(resolve(root, path)));
if (missing.length) throw new Error(`Native dependency output is missing: ${missing.join(", ")}`);
console.log("Native 3DS dependencies are ready.");
