import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createApiApp } from "./app";
import { ensureGamesmithBaked } from "./gemini-proxy";

const rootDir = process.cwd();

function parseCliArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1] && !args[i + 1].startsWith("-")) {
      return args[i + 1];
    }
    if (args[i].startsWith(`${flag}=`)) {
      return args[i].slice(flag.length + 1);
    }
  }
  return undefined;
}

function ensureCartHostBuilt(): void {
  if (process.env.VERCEL) return;
  const hostHtmlPath = path.join(rootDir, "public", "cart", "host.html");
  const buildCartScript = path.join(rootDir, "scripts", "build-cart.mjs");
  if (!fs.existsSync(hostHtmlPath) && fs.existsSync(buildCartScript)) {
    try {
      execFileSync(process.execPath, [buildCartScript], { cwd: rootDir, stdio: "inherit" });
    } catch (err: any) {
      console.warn("[playglow-server] build-cart warning:", err?.message || err);
    }
  }
}

async function startServer(): Promise<void> {
  ensureCartHostBuilt();

  const app = createApiApp();

  const distDir = path.join(rootDir, "dist");
  const distIndexHtml = path.join(distDir, "index.html");
  const isBundledServer = Boolean(process.argv[1]?.endsWith("server.cjs"));
  const hasViteSource = fs.existsSync(path.join(rootDir, "src", "main.tsx"));
  const useStaticDist =
    (process.env.NODE_ENV === "production" ||
      process.env.USE_DIST === "1" ||
      isBundledServer ||
      !hasViteSource) &&
    fs.existsSync(distIndexHtml);

  if (useStaticDist) {
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(distIndexHtml);
    });
  } else {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        root: rootDir,
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err: any) {
      if (fs.existsSync(distIndexHtml)) {
        app.use(express.static(distDir));
        app.use((_req, res) => {
          res.sendFile(distIndexHtml);
        });
      } else {
        console.error("[playglow-server] Failed to initialize Vite middleware:", err?.message || err);
      }
    }
  }

  const cliPort = parseCliArg("--port");
  const cliHost = parseCliArg("--host");
  const port = Number(cliPort || process.env.PORT || process.env.API_PORT || 3000);
  const listenHost = cliHost || process.env.HOST || "0.0.0.0";

  app.listen(port, listenHost, () => {
    console.log(`[playglow-server] listening on http://${listenHost}:${port}`);
    void ensureGamesmithBaked();
  });
}

startServer().catch((err) => {
  console.error("[playglow-server] Fatal startup error:", err);
  process.exit(1);
});
