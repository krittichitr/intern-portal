import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import "dotenv/config";

test("server entry point starts, handles database errors safely, and shuts down", async () => {
  const child = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env, PORT: "0",
      // An intentionally unavailable database checks the error boundary without
      // disconnecting the user's PostgreSQL server or touching existing data.
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/unavailable?connect_timeout=1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timed out")), 10000);
      child.once("error", (error) => { clearTimeout(timeout); reject(error); });
      child.once("exit", () => { clearTimeout(timeout); reject(new Error("Server exited before startup")); });
      child.stdout.on("data", (chunk) => {
        const match = chunk.toString().match(/Server running on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test", password: "test-password" }),
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { success: false, message: "Internal server error" });
  } finally {
    child.kill("SIGTERM");
    const [code] = await exited;
    assert.equal(code, 0);
  }
});

test("production enables Secure HttpOnly cookies", async () => {
  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, ["--input-type=module", "-e",
    "import {cookieOptions} from './src/config.js'; console.log(JSON.stringify(cookieOptions));"], {
    env: { ...process.env, NODE_ENV: "production" },
  });
  assert.deepEqual(JSON.parse(stdout), { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
});
