/**
 * Runner for test-p0-helpers.ts (requires tsx).
 * Run from web/: node scripts/test-p0-helpers.mjs
 */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dir, "..");
const tsFile = resolve(__dir, "test-p0-helpers.ts");

try {
  execSync(`npx tsx "${tsFile}"`, { cwd: webRoot, stdio: "inherit", shell: true });
} catch {
  process.exit(1);
}
