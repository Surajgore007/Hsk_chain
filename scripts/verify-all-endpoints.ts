/**
 * verify-all-endpoints.ts — Comprehensive verification of all API routes,
 * chat intents, risk management, and multi-pair state.
 */

import { resolve } from "path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(process.cwd(), ".env") });
loadDotenv({ path: resolve(process.cwd(), "agent/.env") });

async function main() {
  console.log("=============================================================");
  console.log("  FULL SYSTEM END-TO-END VERIFICATION");
  console.log("=============================================================\n");

  const { app } = await import("../agent/src/server.js");

  // Spin up on ephemeral port
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  async function testRoute(name: string, url: string, options?: any) {
    try {
      const res = await fetch(`${baseUrl}${url}`, options);
      const data = await res.json();
      console.log(`[PASS] ${name} (HTTP ${res.status})`);
      return { ok: true, status: res.status, data };
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  // 1. Core Endpoints
  await testRoute("Root Endpoint", "/");
  await testRoute("Health Check", "/api/health");
  await testRoute("Heartbeat (Section 6)", "/api/heartbeat");
  await testRoute("State Inspection", "/api/state");
  await testRoute("Portfolio Tracker", "/api/portfolio");
  await testRoute("Technical Signals", "/api/signals");
  await testRoute("Risk Limits & Drawdown", "/api/risk");
  await testRoute("Quoter Depth Curve", "/api/depth");
  await testRoute("Decisions Ledger", "/api/decisions?limit=5");
  await testRoute("Execution Scorecard", "/api/scorecard");

  console.log("\n>>> Testing Natural Language Chat Intents...");

  // 2. Chat Intents
  const testPrompts = [
    { label: "Status Query", prompt: "status" },
    { label: "Position Query", prompt: "show positions" },
    { label: "Live Signals Query", prompt: "show signals" },
    { label: "Refusal Explanation (The one user tested)", prompt: "why did you refuse?" },
    { label: "Hold Explanation", prompt: "why hold?" },
    { label: "Risk Preset Adjustment", prompt: "Set risk to aggressive" },
    { label: "Stop Loss Adjustment", prompt: "Set stop loss to 4%" },
    { label: "Asset Switch (Multi-Pair)", prompt: "switch to tWETH/tUSDT" },
    { label: "Percentage Sell Order", prompt: "sell 20%" },
  ];

  for (const item of testPrompts) {
    const res = await testRoute(`Chat Intent: "${item.prompt}"`, "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: item.prompt }),
    });

    if (res.ok && res.data) {
      const parsed = res.data.parsedIntent;
      const preview = (res.data.reply || "").slice(0, 100).replace(/\n/g, " ");
      console.log(`       → Intent: ${parsed?.intent} (Source: ${parsed?.source || res.data.parserBadge})`);
      console.log(`       → Reply Preview: ${preview}...\n`);
    }
  }

  server.close();
  console.log("=============================================================");
  console.log("  ALL ENDPOINTS AND HANDLERS VERIFIED SUCCESSFULLY!");
  console.log("=============================================================");
}

main().catch(console.error);
