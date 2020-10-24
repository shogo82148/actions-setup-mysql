import * as core from '@actions/core'
import * as installer from './installer'
import * as starter from './starter'

async function run(): Promise<void> {
  try {
    const version = core.getInput('mysql-version')
    const autoStart = parseBoolean(core.getInput('auto-start'))

    const mysqlPath = await core.group('install redis', async () => {
      return installer.getMySQL(version)
    })

    if (autoStart) {
      await starter.startMySQL(mysqlPath)
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
