import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as semver from "semver";
import * as tc from "@actions/tool-cache";
import mysqlVersions from "../versions/mysql.json";
import mariadbVersions from "../versions/mariadb.json";

const osPlat = os.platform();
const osArch = os.arch();
const virtualEnv = getVirtualEnvironmentName();

interface Version {
  distribution: string;
  arch: string;
  os: string;
  sha256: string;
  url: string;
  version: string;
}

export interface MySQL {
  distribution: string;
  version: string;
  toolPath: string;
}

function determineVersion(distribution: string, version: string): Version {
  if (version.startsWith("mysql-")) {
    distribution = "mysql";
    version = version.substring("mysql-".length);
  } else if (version.startsWith("mariadb-")) {
    distribution = "mariadb";
    version = version.substring("mariadb-".length);
  }
  const availableVersions = distribution === "mysql" ? mysqlVersions : mariadbVersions;
  for (const v of availableVersions) {
    if (
      v.arch == osArch &&
      (v.os == osPlat || v.os == virtualEnv) &&
      semver.satisfies(v.version, version)
    ) {
      return v;
    }
  }
  throw new Error("unable to get latest version");
}

export async function getMySQL(
  distribution: string,
  version: string,
  githubToken: string,
): Promise<MySQL> {
  const selected = determineVersion(distribution, version);

  // check cache
  let toolPath: string;
  toolPath = tc.find(selected.distribution, selected.version);

  if (!toolPath) {
    // download, extract, cache
    toolPath = await acquireMySQL(selected);
    core.debug(`MySQL tool is cached under ${toolPath}`);
  }

  //
  // prepend the tools path. instructs the agent to prepend for future tasks
  //
  const bin = path.join(toolPath, "bin");
  core.addPath(bin);

  return { distribution: selected.distribution, version: selected.version, toolPath };
}

async function acquireMySQL(version: Version): Promise<string> {
  //
  // Download - a tool installer intimately knows how to get the tool (and construct urls)
  //
  let downloadPath: string | null = null;
  try {
    core.info(`downloading from ${version.url}`);
    downloadPath = await tc.downloadTool(version.url);
  } catch (error) {
    if (error instanceof Error) {
      core.info(error.message);
    } else {
      core.info(`${error}`);
    }

    throw new Error(`Failed to download version ${version}: ${error}`);
  }

  //
  // Extract Zstandard compressed tar
  //
  const extPath = version.url.endsWith(".zip")
    ? await tc.extractZip(downloadPath)
    : await tc.extractTar(downloadPath, "", ["--use-compress-program", "zstd -d --long=30", "-x"]);

  return await tc.cacheDir(extPath, version.distribution, version.version);
}

function getImageOS(): string {
  return process.env["ImageOS"] || "unknown";
}

function getVirtualEnvironmentName(): string {
  const imageOS = getImageOS();

  let match = imageOS.match(/^ubuntu(\d+)/); // e.g. ubuntu18
  if (match) {
    return `ubuntu-${match[1]}.04`;
  }

  match = imageOS.match(/^macos(\d{2})(\d+)?/); // e.g. macos1015, macos11
  if (match) {
    return `macos-${match[1]}.${match[2] || "0"}`;
  }

  match = imageOS.match(/^win(\d+)/); // e.g. win19
  if (match) {
    return `windows-20${match[1]}`;
  }

  return "unknown";
}
