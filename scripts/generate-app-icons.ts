/**
 * Generate PullMatch GitHub App icon PNGs from apps/web/public/favicon.svg.
 *
 * Produces (in apps/web/public/):
 *   - app-icon-1024.png  (GitHub App settings logo upload)
 *   - app-icon-200.png   (Marketplace listing)
 *   - app-icon-40.png    (Bot comment avatar fallback)
 *
 * One-off; not wired into the build. Re-run manually if the source SVG changes:
 *   node --experimental-strip-types scripts/generate-app-icons.ts
 *
 * Unblocks PUL-93 (public GitHub App listing).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const publicDir = resolve(repoRoot, "apps/web/public");
const sourceSvg = resolve(publicDir, "favicon.svg");

const sizes = [1024, 200, 40] as const;

async function main() {
  const svg = readFileSync(sourceSvg);

  for (const size of sizes) {
    // High density for the SVG raster step so small sizes stay crisp after
    // downscaling. 2400 DPI against a 32x32 viewBox keeps edges clean.
    const outPath = resolve(publicDir, `app-icon-${size}.png`);
    await sharp(svg, { density: 2400 })
      .resize(size, size, { fit: "contain" })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
