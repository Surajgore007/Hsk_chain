/**
 * mover.ts — Market Mover Script (Demo Tooling)
 *
 * Uses the MOVER wallet to execute trades in the testnet pool,
 * intentionally moving the spot price up or down to generate
 * verifiable reference-price reversion signals for the demo.
 *
 * Clearly labelled as DEMO TOOLING.
 */

import { APP_CONFIG } from "../agent/src/config.js";

async function main() {
  const action = process.argv[2] || "PUSH_PRICE_DOWN";
  console.log(`[Market Mover] Triggering action: ${action}...`);

  const res = await fetch(`http://localhost:${APP_CONFIG.PORT}/api/demo/mover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });

  const data = await res.json();
  console.log("[Market Mover] Response:", data);
}

main().catch(console.error);

