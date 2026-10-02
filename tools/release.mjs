// A clean, versioned release: only what Foundry loads, in dist/kg-cities-<version>/kg-cities,
// plus dist/kg-cities-<version>.zip. Sets the version in module.json first.
//   node tools/release.mjs 0.2.0
// Copy dist/kg-cities-<version>/kg-cities into the live Data/modules folder (replace the old
// folder), or upload the zip.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node tools/release.mjs <major.minor.patch>");
  process.exit(1);
}

// What the live module needs. Everything else (tools, tests, mockups, caches) stays out.
const SHIP = ["module.json", "scripts", "styles", "lib", "data/fonts", "data/cities", "data/transit", "README.md", "CHANGELOG.md"];

const manifestPath = join(ROOT, "module.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const base = join(ROOT, "dist", `kg-cities-${version}`);
const out = join(base, "kg-cities");
rmSync(base, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of SHIP) {
  const from = join(ROOT, item);
  if (!existsSync(from)) continue;
  mkdirSync(dirname(join(out, item)), { recursive: true });
  cpSync(from, join(out, item), { recursive: true });
}

const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((n, f) => n + size(join(p, f)), 0) : statSync(p).size);
const zip = join(ROOT, "dist", `kg-cities-${version}.zip`);
rmSync(zip, { force: true });
const z = spawnSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${out}' -DestinationPath '${zip}'`], { stdio: "inherit" });
console.log(`kg-cities ${version}: ${out} (${(size(out) / 1e6).toFixed(1)} MB)${z.status === 0 ? `, ${zip}` : ", zip not made"}`);
