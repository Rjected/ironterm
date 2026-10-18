// Copies your locally installed Berkeley Mono into public/fonts (gitignored) so the deployed
// site can serve it. Only do this if your Berkeley Mono license covers web use; otherwise the
// CSS still picks it up via local() on machines that have it installed.
import { copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), "Library/Fonts");
for (const f of ["BerkeleyMono-Regular.ttf", "BerkeleyMono-Bold.ttf", "BerkeleyMono-Italic.ttf"]) {
  const src = join(dir, f);
  if (existsSync(src)) { copyFileSync(src, join("public/fonts", f)); console.log("copied", f); }
  else console.log("missing", src);
}
