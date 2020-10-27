import * as core from '@actions/core'
import * as cleanup from './cleanup'
import * as starter from './starter'

async function run(): Promise<void> {
  try {
    const state = starter.getState()
    if (state) {
      cleanup.shutdownMySQL(state)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
