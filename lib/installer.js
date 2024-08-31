"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMySQL = getMySQL;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const tc = __importStar(require("@actions/tool-cache"));
const osPlat = os.platform();
const osArch = os.arch();
const virtualEnv = getVirtualEnvironmentName();
async function getAvailableVersions(distribution) {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, "..", "versions", `${distribution}.json`), (err, data) => {
            if (err) {
                reject(err);
            }
            const info = JSON.parse(data.toString());
            resolve(info);
        });
    });
}
async function determineVersion(distribution, version) {
    if (version.startsWith("mysql-")) {
        distribution = "mysql";
        version = version.substring("mysql-".length);
    }
    else if (version.startsWith("mariadb-")) {
        distribution = "mariadb";
        version = version.substring("mariadb-".length);
    }
    const availableVersions = await getAvailableVersions(distribution);
    for (const v of availableVersions) {
        if (semver.satisfies(v, version)) {
            return {
                distribution,
                version: v,
                toolPath: "",
            };
        }
    }
    throw new Error("unable to get latest version");
}
async function getMySQL(distribution, version) {
    const selected = await determineVersion(distribution, version);
    // check cache
    let toolPath;
    toolPath = tc.find(selected.distribution, selected.version);
    if (!toolPath) {
        // download, extract, cache
        toolPath = await acquireMySQL(selected.distribution, selected.version);
        core.debug(`MySQL tool is cached under ${toolPath}`);
    }
    //
    // prepend the tools path. instructs the agent to prepend for future tasks
    //
    const bin = path.join(toolPath, "bin");
    core.addPath(bin);
    return {
        distribution: selected.distribution,
        version: selected.version,
        toolPath,
    };
}
async function acquireMySQL(distribution, version) {
    //
    // Download - a tool installer intimately knows how to get the tool (and construct urls)
    //
    const fileName = getFileName(distribution, version);
    const downloadUrl = await getDownloadUrl(fileName);
    let downloadPath = null;
    try {
        core.info(`downloading from ${downloadUrl}`);
        downloadPath = await tc.downloadTool(downloadUrl);
    }
    catch (error) {
        if (error instanceof Error) {
            core.info(error.message);
        }
        else {
            core.info(`${error}`);
        }
        throw new Error(`Failed to download version ${version}: ${error}`);
    }
    //
    // Extract Zstandard compressed tar
    //
    const extPath = downloadUrl.endsWith(".zip")
        ? await tc.extractZip(downloadPath)
        : await tc.extractTar(downloadPath, "", ["--use-compress-program", "zstd -d --long=30", "-x"]);
    return await tc.cacheDir(extPath, distribution, version);
}
function getFileName(distribution, version) {
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
async function getDownloadUrl(filename) {
    const promise = new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, "..", "package.json"), (err, data) => {
            if (err) {
                reject(err);
            }
            const info = JSON.parse(data.toString());
            resolve(info);
        });
    });
    const info = await promise;
    const actionsVersion = info.version;
    return `https://github.com/shogo82148/actions-setup-mysql/releases/download/v${actionsVersion}/${filename}`;
}
function getImageOS() {
    const imageOS = process.env["ImageOS"];
    if (!imageOS) {
        throw new Error("The environment variable ImageOS must be set");
    }
    return imageOS;
}
function getVirtualEnvironmentName() {
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