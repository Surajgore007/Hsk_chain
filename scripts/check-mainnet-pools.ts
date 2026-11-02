import { createPublicClient, http, parseAbi } from "viem";
import { hskMainnetReadonly } from "../agent/src/config.js";

const FACTORY_ABI = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
]);

async function main() {
  const client = createPublicClient({ chain: hskMainnetReadonly, transport: http("https://mainnet.hsk.xyz") });
  const factory = "0x2dC2c21D1049F786C535bF9d45F999dB5474f3A0";
  console.log("Checking mainnet factory at", factory);
  // Mainnet WHSK/USDT pool: 0x4ff515761864e7838b0adb8b5b2b8b7a068905dc
  // Let's verify factory has code on mainnet
  const code = await client.getBytecode({ address: factory });
  console.log("Mainnet Factory code length:", code ? code.length : 0);
}
main().catch(console.error);

