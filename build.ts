#!/usr/bin/env bun
// Build all scripts to .bin/
// To add a new script: add an entry to TS_SCRIPTS below, and a [[bin]] to Cargo.toml for Rust.
import { spawnSync } from "child_process";
import { mkdirSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dir;
const BIN_DIR = join(ROOT, ".bin");

mkdirSync(BIN_DIR, { recursive: true });

// --- TypeScript scripts ---
// [ entrypoint, output binary name ]
const TS_SCRIPTS: [string, string][] = [
  ["git-ai-commit/clack.ts", "git-ai-commit"],
  ["git-ai-commit/inquirer.ts", "git-ai-commit-inquirer"],
];

console.log("Building TypeScript scripts...");
for (const [entry, output] of TS_SCRIPTS) {
  process.stdout.write(`  ${output}... `);
  const result = spawnSync(
    "bun",
    [
      "build",
      "--compile",
      "--outfile",
      join(BIN_DIR, output),
      join(ROOT, entry),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  console.log(result.status === 0 ? "✔" : "✖");
  if (result.status !== 0) console.error(result.stderr?.toString());
}

// --- Rust binaries ---
const cargoCheck = spawnSync("which", ["cargo"], { stdio: "ignore" });
if (cargoCheck.status === 0) {
  console.log("\nBuilding Rust binaries...");
  const result = spawnSync("cargo", ["build", "--release"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    // Copy all release binaries (skip cargo internals)
    const { readdirSync } = await import("fs");
    const releaseDir = join(ROOT, "target", "release");
    const skip = new Set(["build", "deps", "examples", "incremental"]);
    const binaries = readdirSync(releaseDir).filter(
      (f) => !f.includes(".") && !skip.has(f),
    );
    for (const bin of binaries) {
      spawnSync("cp", [join(releaseDir, bin), join(BIN_DIR, bin)]);
      console.log(`  ${bin} ✔`);
    }
  } else {
    console.log("  ✖");
    console.error(result.stderr?.toString());
  }
} else {
  console.log("\nSkipping Rust (cargo not found).");
}

console.log(`\nDone. Binaries in .bin/`);
