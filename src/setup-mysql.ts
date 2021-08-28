import * as core from '@actions/core'
import * as installer from './installer'
import * as starter from './starter'

async function run(): Promise<void> {
  try {
    const version = core.getInput('mysql-version')
    const distribution = core.getInput('distribution')
    const autoStart = core.getBooleanInput('auto-start')
    const cnf = core.getInput('my-cnf')
    const rootPassword = core.getInput('root-password')
    const user = core.getInput('user')
    const password = core.getInput('password')

    const mysql = await core.group('install MySQL', async () => {
      return installer.getMySQL(distribution, version)
    })

    if (autoStart) {
      const state = await starter.startMySQL(mysql, cnf, rootPassword)
      if (user) {
        await core.group('create new user', async () => {
          await starter.createUser(state, user, password)
        })
      }
      starter.saveState(state)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(`${error}`)
    }
  }
}

run()
