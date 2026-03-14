import * as cleanup from "./cleanup.js";
import * as core from "@actions/core";
import * as starter from "./starter.js";

async function run(): Promise<void> {
  try {
    const state = starter.getState();
    if (state) {
      await cleanup.shutdownMySQL(state);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.warning(`failed to clean up: ${error.message}`);
    } else {
      core.warning(`failed to clean up: ${error}`);
    }
  }
}

void run();
