import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const roots = ["server.js", "main.js", "server", "modules", "shared", "scripts", "tests"];
const files = [];

const collect = (entry) => {
  if (!fs.existsSync(entry)) return;
  const stat = fs.statSync(entry);
  if (stat.isFile() && entry.endsWith(".js") || stat.isFile() && entry.endsWith(".mjs")) {
    files.push(entry);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const child of fs.readdirSync(entry)) collect(path.join(entry, child));
};

roots.forEach(collect);
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} files.`);
