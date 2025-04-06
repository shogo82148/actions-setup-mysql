import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as semver from "semver";
import * as tc from "@actions/tool-cache";
import { verify } from "@shogo82148/attestation-verify";

const osPlat = os.platform();
const osArch = os.arch();
const virtualEnv = getVirtualEnvironmentName();

export interface MySQL {
  distribution: string;
  version: string;
  toolPath: string;
}

async function getAvailableVersions(distribution: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    fs.readFile(path.join(__dirname, "..", "versions", `${distribution}.json`), (err, data) => {
      if (err) {
        reject(err);
      }
      const info = JSON.parse(data.toString()) as string[];
      resolve(info);
    });
  });
}

async function determineVersion(distribution: string, version: string): Promise<MySQL> {
  if (version.startsWith("mysql-")) {
    distribution = "mysql";
    version = version.substring("mysql-".length);
  } else if (version.startsWith("mariadb-")) {
    distribution = "mariadb";
    version = version.substring("mariadb-".length);
  }
  const availableVersions = await getAvailableVersions(distribution);
  for (const v of availableVersions) {
    if (semver.satisfies(v, version)) {
      return { distribution, version: v, toolPath: "" };
    }
  }
  throw new Error("unable to get latest version");
}

export async function getMySQL(
  distribution: string,
  version: string,
  githubToken: string,
): Promise<MySQL> {
  const selected = await determineVersion(distribution, version);

  // check cache
  let toolPath: string;
  toolPath = tc.find(selected.distribution, selected.version);

  if (!toolPath) {
    // download, extract, cache
    toolPath = await acquireMySQL(selected.distribution, selected.version, githubToken);
    core.debug(`MySQL tool is cached under ${toolPath}`);
  }

  //
  // prepend the tools path. instructs the agent to prepend for future tasks
  //
  const bin = path.join(toolPath, "bin");
  core.addPath(bin);

  return { distribution: selected.distribution, version: selected.version, toolPath };
}

async function acquireMySQL(
  distribution: string,
  version: string,
  githubToken: string,
): Promise<string> {
  //
  // Download - a tool installer intimately knows how to get the tool (and construct urls)
  //
  const fileName = getFileName(distribution, version);
  const downloadUrl = await getDownloadUrl(fileName);
  let downloadPath: string | null = null;
  try {
    core.info(`downloading from ${downloadUrl}`);
    downloadPath = await tc.downloadTool(downloadUrl);
  } catch (error) {
    if (error instanceof Error) {
      core.info(error.message);
    } else {
      core.info(`${error}`);
    }

    throw new Error(`Failed to download version ${version}: ${error}`);
  }

  //
  // Verify
  //
  core.info(`verifying ${downloadPath}`);
  await verify(downloadPath, {
    githubToken: githubToken,
    repository: "shogo82148/actions-setup-mysql",
  });

  //
  // Extract Zstandard compressed tar
  //
  const extPath = downloadUrl.endsWith(".zip")
    ? await tc.extractZip(downloadPath)
    : await tc.extractTar(downloadPath, "", ["--use-compress-program", "zstd -d --long=30", "-x"]);

  return await tc.cacheDir(extPath, distribution, version);
}

function getFileName(distribution: string, version: string): string {
  switch (osPlat) {
    case "win32":
      return `${distribution}-${version}-${osPlat}-${osArch}.zip`;
    case "darwin":
      return `${distribution}-${version}-${osPlat}-${osArch}.tar.zstd`;
    case "linux":
      return `${distribution}-${version}-${virtualEnv}-${osArch}.tar.zstd`;
  }
  throw new Error(`unknown platform: ${osPlat}`);
}

interface PackageVersion {
  version: string;
}

async function getDownloadUrl(filename: string): Promise<string> {
  const promise = new Promise<PackageVersion>((resolve, reject) => {
    fs.readFile(path.join(__dirname, "..", "package.json"), (err, data) => {
      if (err) {
        reject(err);
      }
      const info: PackageVersion = JSON.parse(data.toString());
      resolve(info);
    });
  });

  const info = await promise;
  const actionsVersion = info.version;
  return `https://github.com/shogo82148/actions-setup-mysql/releases/download/v${actionsVersion}/${filename}`;
}

function getImageOS(): string {
  const imageOS = process.env["ImageOS"];
  if (!imageOS) {
    throw new Error("The environment variable ImageOS must be set");
  }
  return imageOS;
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

  throw new Error(`Unknown ImageOS ${imageOS}`);
}
