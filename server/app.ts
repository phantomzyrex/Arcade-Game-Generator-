import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import {
  createGeminiProxyRouter,
  resetAllCaps,
  resetProbeCaps,
  isSelftestContext,
  getEffectiveAdminToken,
  getServerApiKey,
} from "./gemini-proxy";

export function createApiApp(): Express {
  const app = express();
  app.use(cors());

  app.get(["/api/healthz", "/healthz"], (_req, res) => {
    res.json({
      ok: true,
      hasServerApiKey: Boolean(getServerApiKey()),
    });
  });

  // Admin endpoint to reset rate-limit counters (used by ?selftest Check 9)
  app.post(["/api/admin/reset-caps", "/admin/reset-caps"], (req, res) => {
    const adminToken = getEffectiveAdminToken();
    const provided = req.headers["x-admin-token"];
    const validAdmin = Boolean(adminToken && provided === adminToken);
    const isAiStudioDev =
      process.env.NODE_ENV !== "production" ||
      process.env.DISABLE_HMR === "true" ||
      Boolean(process.env.K_SERVICE) ||
      Boolean(process.env.VERCEL);

    if (validAdmin || isAiStudioDev) {
      resetAllCaps();
      res.json({ ok: true });
      return;
    }

    if (isSelftestContext(req)) {
      resetProbeCaps();
      res.json({ ok: true, probeOnly: true });
      return;
    }

    res.status(401).json({ error: { message: "Unauthorized: invalid or missing x-admin-token" } });
  });

  // Selftest helper endpoint: provides ADMIN_TOKEN during ?selftest or local dev
  app.get(["/api/admin/selftest-token", "/admin/selftest-token"], (req, res) => {
    const host = req.headers.host || "";
    const hasForwardedFor = Boolean(req.headers["x-forwarded-for"] || req.headers["x-forwarded-host"]);
    const isLocalHostHeader =
      host === "localhost" ||
      host.startsWith("localhost:") ||
      host === "127.0.0.1" ||
      host.startsWith("127.0.0.1:");
    const isStrictLocalDev =
      !hasForwardedFor &&
      isLocalHostHeader &&
      process.env.NODE_ENV !== "production" &&
      (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1");

    const isAiStudioSelftest =
      (process.env.NODE_ENV !== "production" ||
        process.env.DISABLE_HMR === "true" ||
        Boolean(process.env.K_SERVICE) ||
        Boolean(process.env.VERCEL)) &&
      isSelftestContext(req);

    const allowRemoteSelftest = process.env.ALLOW_REMOTE_SELFTEST === "true";

    const adminToken = getEffectiveAdminToken();
    const validHeader = Boolean(adminToken) && req.headers["x-admin-token"] === adminToken;

    if (!isStrictLocalDev && !isAiStudioSelftest && !allowRemoteSelftest && !validHeader) {
      res.status(403).json({ error: { message: "Forbidden" } });
      return;
    }
    res.json({ adminToken });
  });

  // Mount Gemini proxy at /api/gemini (and /gemini for stripped serverless rewrites)
  const geminiRouter = createGeminiProxyRouter();
  app.use(["/api/gemini", "/gemini"], geminiRouter);

  return app;
}
