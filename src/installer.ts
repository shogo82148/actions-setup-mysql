import * as core from '@actions/core'
import * as tc from '@actions/tool-cache'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as semver from 'semver'

const osPlat = os.platform()
const osArch = os.arch()

export interface MySQL {
  distribution: string
  version: string
  toolPath: string
}

async function getAvailableVersions(distribution: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    fs.readFile(
      path.join(__dirname, '..', 'versions', `${distribution}.json`),
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

async function determineVersion(
  distribution: string,
  version: string
): Promise<MySQL> {
  if (version.startsWith('mysql-')) {
    distribution = 'mysql'
    version = version.substring('mysql-'.length)
  } else if (version.startsWith('mariadb-')) {
    distribution = 'mariadb'
    version = version.substring('mariadb-'.length)
  }
  const availableVersions = await getAvailableVersions(distribution)
  for (let v of availableVersions) {
    if (semver.satisfies(v, version)) {
      return {
        distribution: distribution,
        version: v,
        toolPath: ''
      }
    }
  }
  throw new Error('unable to get latest version')
}

export async function getMySQL(
  distribution: string,
  version: string
): Promise<MySQL> {
  const selected = await determineVersion(distribution, version)

  // check cache
  let toolPath: string
  toolPath = tc.find(selected.distribution, selected.version)

  if (!toolPath) {
    // download, extract, cache
    toolPath = await acquireMySQL(selected.distribution, selected.version)
    core.debug('MySQL tool is cached under ' + toolPath)
  }

  //
  // prepend the tools path. instructs the agent to prepend for future tasks
  //
  const bin = path.join(toolPath, 'bin')
  core.addPath(bin)

  return {
    distribution: selected.distribution,
    version: selected.version,
    toolPath: toolPath
  }
}

async function acquireMySQL(
  distribution: string,
  version: string
): Promise<string> {
  //
  // Download - a tool installer intimately knows how to get the tool (and construct urls)
  //
  const fileName = getFileName(distribution, version)
  const downloadUrl = await getDownloadUrl(fileName)
  let downloadPath: string | null = null
  try {
    core.info(`downloading from ${downloadUrl}`)
    downloadPath = await tc.downloadTool(downloadUrl)
  } catch (error) {
    core.info(error)

    throw `Failed to download version ${version}: ${error}`
  }

  //
  // Extract XZ compressed tar
  //
  const extPath = downloadUrl.endsWith('.zip')
    ? await tc.extractZip(downloadPath)
    : downloadUrl.endsWith('.tar.xz')
    ? await tc.extractTar(downloadPath, '', 'xJ')
    : downloadUrl.endsWith('.tar.bz2')
    ? await tc.extractTar(downloadPath, '', 'xj')
    : await tc.extractTar(downloadPath)

  return await tc.cacheDir(extPath, distribution, version)
}

function getFileName(distribution: string, version: string): string {
  const ext = osPlat === 'win32' ? 'zip' : 'tar.xz'
  return `${distribution}-${version}-${osPlat}-${osArch}.${ext}`
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
    return `https://setupmysql.blob.core.windows.net/actions-setup-mysql/v${actionsVersion}/${filename}`
  })
}
