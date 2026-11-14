#!/usr/bin/env node
/**
 * One-command whole-app rehearsal: builds an isolated copy of the app, serves it on :3200 with a fresh
 * local demo DB, and drives the full demo (typed + voice check-ins, Vexo band replay, review, doctor)
 * in a real browser, saving a screenshot per step plus a video and an HTML report.
 *
 * Usage: npm run test:run -- [--file <band file>] [--headed] [--skip-build] [--mock-ai]
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const PORT = "3200";
const DIST = ".next-testrun";
const DB = ".data/test-run-db.json";

function fail(message) {
  console.error(`\ntest:run: ${message}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { file: "vexo-band/maya-band-capture.txt", headed: false, skipBuild: false, mockAi: false, vexoMode: "file" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith("--")) fail(`${a} needs a value.`);
      return v;
    };
    if (a === "--file") opts.file = value();
    else if (a === "--headed") opts.headed = true;
    else if (a === "--skip-build") opts.skipBuild = true;
    else if (a === "--mock-ai") opts.mockAi = true;
    else if (a === "--vexo-mode") opts.vexoMode = value(); // dev override, e.g. "mock"
    else if (a === "--help" || a === "-h") {
      console.log("Usage: npm run test:run -- [--file <band file>] [--headed] [--skip-build] [--mock-ai]");
      process.exit(0);
    } else fail(`Unknown option ${a}. Try --help.`);
  }
  return opts;
}

/** Minimal .env reader, only used to describe (not to set) the AI mode in the header. */
function envFileValue(name) {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    // [ \t] rather than \s: \s also matches line breaks, so an empty "NAME=" line would swallow the next line.
    const m = readFileSync(f, "utf8").match(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*(.*)$`, "m"));
    if (m) {
      const v = m[1].replace(/\s+#.*$/, "").trim().replace(/^(['"`])(.*)\1$/, "$2");
      if (v) return v;
    }
  }
  return "";
}

function run(label, args, env) {
  return new Promise((resolveRun) => {
    console.log(`\n> ${label}`);
    const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    child.on("error", (e) => {
      console.error(`Could not start ${label}: ${e.message}`);
      resolveRun(1);
    });
    child.on("close", (code, signal) => resolveRun(code ?? (signal ? 1 : 0)));
  });
}

const opts = parseArgs(process.argv.slice(2));
const bandFile = isAbsolute(opts.file) ? opts.file : resolve(root, opts.file);
if (opts.vexoMode === "file" && !existsSync(bandFile)) {
  fail(`Band file not found: ${bandFile}\nPass one with --file <path> (see vexo-band/README.md).`);
}
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const pwCli = join(root, "node_modules", "@playwright", "test", "cli.js");
for (const p of [nextBin, pwCli]) if (!existsSync(p)) fail(`Missing ${p}. Run npm install first.`);
if (opts.skipBuild && !existsSync(join(root, DIST, "BUILD_ID"))) {
  fail(`--skip-build needs an earlier build in ${DIST}. Run once without --skip-build.`);
}

const hasOpenAi = !opts.mockAi && Boolean(process.env.OPENAI_API_KEY || envFileValue("OPENAI_API_KEY"));
const bandRel = isAbsolute(opts.file) ? opts.file : opts.file.replaceAll("\\", "/");

// Empty strings win over .env.local: Next only fills variables that are not already defined in process.env.
const forcedEmpty = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PIPECAT_VOICE_URL",
  "VEXO_BAND_NUMBER",
  "VEXO_BAND_SECRET",
  "VEXO_BAND_WEARER",
  ...(opts.mockAi ? ["OPENAI_API_KEY"] : []),
];
const env = {
  ...process.env,
  ...Object.fromEntries(forcedEmpty.map((k) => [k, ""])),
  NEXT_DIST_DIR: DIST,
  DOCTORLOOP_LOCAL_DB_PATH: DB,
  ENABLE_DEMO_ROLE_SWITCHER: "true",
  SESSION_SECRET: "test-run-only-session-secret-not-for-real-use-0123456789",
  NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
  VEXO_MODE: opts.vexoMode,
  VEXO_FILE_PATH: bandRel,
  TEST_RUN_PORT: PORT,
  TEST_RUN_BAND_FILE: bandRel,
  TEST_RUN_AI_MODE: hasOpenAi ? "openai" : "mock",
  TEST_RUN_VEXO_MODE: opts.vexoMode,
  ...(opts.headed ? { TEST_RUN_HEADED: "1" } : {}),
};
delete env.NODE_ENV; // let next build/start pick production themselves

console.log("DoctorLoop AI - whole-app test run");
console.log(`  AI     : ${hasOpenAi ? "real OpenAI (OPENAI_API_KEY found)" : opts.mockAi ? "mock (forced by --mock-ai)" : "mock (no OPENAI_API_KEY)"}`);
console.log(`  Band   : ${opts.vexoMode === "file" ? `${basename(bandFile)} (${bandRel})` : `VEXO_MODE=${opts.vexoMode} (override, no band file used)`}`);
console.log("  Data   : local demo DB (fresh, .data/test-run-db.json)");
console.log("  Voice  : simulated");
console.log(`  Server : http://localhost:${PORT} (build in ${DIST})`);

// next build rewrites these; put them back afterwards.
const snapshots = ["next-env.d.ts", "tsconfig.json"].map((f) => ({ f, content: existsSync(f) ? readFileSync(f) : null }));

let exitCode = 1;
try {
  if (!opts.skipBuild) {
    rmSync(join(root, DIST), { recursive: true, force: true });
    const code = await run("next build (isolated)", [nextBin, "build"], env);
    if (code !== 0) {
      console.error(`\nBuild failed (exit ${code}).`);
      exitCode = code;
      throw new Error("build failed");
    }
  }
  rmSync(join(root, DB), { force: true });
  rmSync(join(root, ".verification", "test-run"), { recursive: true, force: true });
  mkdirSync(join(root, ".verification", "test-run"), { recursive: true });
  exitCode = await run("playwright (whole-app journey)", [pwCli, "test", "-c", "playwright.test-run.config.ts"], env);
} catch (e) {
  if (e.message !== "build failed") throw e;
} finally {
  for (const { f, content } of snapshots) if (content) writeFileSync(f, content);
}

console.log(`\n${exitCode === 0 ? "PASSED" : "FAILED"} (exit ${exitCode})`);
console.log("  HTML report  : .verification/test-run-report/index.html");
console.log("  Screenshots  : .verification/test-run/");
console.log("  Videos/trace : .verification/test-run-results/");
console.log("  Open report  : npx playwright show-report .verification/test-run-report");
process.exit(exitCode);
