import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as semver from 'semver'

const osPlat = os.platform()
const osArch = os.arch()

async function getAvailableVersions(): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    fs.readFile(
      path.join(__dirname, '..', 'versions', `mysql.json`),
      (err, data) => {
        if (err) {
          reject(err)
        }
        const info = JSON.parse(data.toString()) as string[]
        resolve(info)
      }
    )
  })
}

async function determineVersion(version: string): Promise<string> {
  const availableVersions = await getAvailableVersions()
  for (let v of availableVersions) {
    if (semver.satisfies(v, version)) {
      return v
    }
  }
  throw new Error('unable to get latest version')
}

export async function getMySQL(version: string): Promise<string> {
  const selected = await determineVersion(version)

  // check cache
  let toolPath: string
  toolPath = tc.find('mysql', selected)

  if (!toolPath) {
    // download, extract, cache
    toolPath = await acquireMySQL(selected)
    core.debug('redis tool is cached under ' + toolPath)
  }

  //
  // prepend the tools path. instructs the agent to prepend for future tasks
  //
  core.addPath(path.join(toolPath, 'bin'))
  return toolPath
}

async function acquireMySQL(version: string): Promise<string> {
  //
  // Download - a tool installer intimately knows how to get the tool (and construct urls)
  //
  const fileName = getFileName(version)
  const downloadUrl = await getDownloadUrl(fileName)
  let downloadPath: string | null = null
  try {
    downloadPath = await tc.downloadTool(downloadUrl)
  } catch (error) {
    core.debug(error)

    throw `Failed to download version ${version}: ${error}`
  }

  //
  // Extract
  //
  const extPath = await tc.extractTar(downloadPath)

  return await tc.cacheDir(extPath, 'mysql', version)
}

function getFileName(version: string): string {
  return `mysql-${version}-${osPlat}-${osArch}.tar.gz`
}

interface PackageVersion {
  version: string
}

async function getDownloadUrl(filename: string): Promise<string> {
  return new Promise<PackageVersion>((resolve, reject) => {
    fs.readFile(path.join(__dirname, '..', 'package.json'), (err, data) => {
      if (err) {
        reject(err)
      }
      const info: PackageVersion = JSON.parse(data.toString())
      resolve(info)
    })
  }).then(info => {
    const actionsVersion = info.version
    return `https://shogo82148-actions-setup-mysql.s3.amazonaws.com/v${actionsVersion}/${filename}`
  })
}
