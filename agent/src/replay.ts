/**
 * replay.ts — Replay Mode Engine
 *
 * Provides deterministic simulation from recorded demo fixtures when testnet RPC
 * or LLM endpoints are offline or when running in demonstration review mode.
 * Always explicitly labelled: REPLAY MODE (recorded).
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { DecisionRecord } from "./ledger.js";

export class ReplayEngine {
  private fixtures: DecisionRecord[] = [];
  private currentIndex: number = 0;

  constructor(fixturesPath?: string) {
    const path = fixturesPath || resolve(process.cwd(), "../fixtures/demo-run.json");
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        this.fixtures = JSON.parse(raw);
      } catch {
        this.fixtures = [];
      }
    }
  }

  public getFixtures(): DecisionRecord[] {
    return this.fixtures;
  }

  public getNextDecision(): DecisionRecord | null {
    if (this.fixtures.length === 0) return null;
    const item = this.fixtures[this.currentIndex % this.fixtures.length];
    this.currentIndex++;
    return {
      ...item,
      id: `replay-${Date.now()}-${this.currentIndex}`,
      ts: Date.now(),
      modeLabel: "REPLAY MODE (recorded)",
    };
  }
}

