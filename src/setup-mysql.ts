import * as core from '@actions/core'
import * as installer from './installer'
import * as starter from './starter'

async function run(): Promise<void> {
  try {
    const version = core.getInput('mysql-version')
    const distribution = core.getInput('distribution')
    const autoStart = parseBoolean(core.getInput('auto-start'))

    const mysql = await core.group('install MySQL', async () => {
      return installer.getMySQL(distribution, version)
    })

    if (autoStart) {
      const state = await starter.startMySQL(mysql)
      starter.saveState(state)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

function parseBoolean(s: string): boolean {
  switch (s) {
    case 'y':
    case 'Y':
    case 'yes':
    case 'Yes':
    case 'YES':
    case 'true':
    case 'True':
    case 'TRUE':
      return true
    case 'n':
    case 'N':
    case 'no':
    case 'No':
    case 'NO':
    case 'false':
    case 'False':
    case 'FALSE':
      return false
  }
  throw `invalid boolean value: ${s}`
}
run()
