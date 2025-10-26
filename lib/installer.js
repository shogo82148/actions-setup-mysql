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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMySQL = getMySQL;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const crypto = __importStar(require("crypto"));
const tc = __importStar(require("@actions/tool-cache"));
const mysql_json_1 = __importDefault(require("../versions/mysql.json"));
const mariadb_json_1 = __importDefault(require("../versions/mariadb.json"));
const osPlat = os.platform();
const osArch = os.arch();
const virtualEnv = getVirtualEnvironmentName();
function determineVersion(distribution, version) {
    if (version.startsWith("mysql-")) {
        distribution = "mysql";
        version = version.substring("mysql-".length);
    }
    else if (version.startsWith("mariadb-")) {
        distribution = "mariadb";
        version = version.substring("mariadb-".length);
    }
    const availableVersions = distribution === "mysql" ? mysql_json_1.default : mariadb_json_1.default;
    for (const v of availableVersions) {
        if (v.arch == osArch &&
            (v.os == osPlat || v.os == virtualEnv) &&
            semver.satisfies(v.version, version)) {
            return v;
        }
    }
    throw new Error("unable to get latest version");
}
async function getMySQL(distribution, version, githubToken) {
    const selected = determineVersion(distribution, version);
    // check cache
    let toolPath;
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
async function acquireMySQL(version) {
    //
    // Download - a tool installer intimately knows how to get the tool (and construct urls)
    //
    let downloadPath = null;
    try {
        core.info(`downloading from ${version.url}`);
        downloadPath = await tc.downloadTool(version.url);
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
    // Verify SHA256
    //
    const hash = await calculateDigest(downloadPath, "sha256");
    if (hash !== version.sha256) {
        throw new Error(`Hash for downloaded MySQL version ${version.version} (${hash}) does not match expected value (${version.sha256})`);
    }
    //
    // Extract Zstandard compressed tar
    //
    const extPath = version.url.endsWith(".zip")
        ? await tc.extractZip(downloadPath)
        : await tc.extractTar(downloadPath, "", ["--use-compress-program", "zstd -d --long=30", "-x"]);
    return await tc.cacheDir(extPath, version.distribution, version.version);
}
async function calculateDigest(filename, algorithm) {
    const hash = await new Promise((resolve, reject) => {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filename);
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", (err) => reject(err));
    });
    return hash;
}
function getImageOS() {
    return process.env["ImageOS"] || "unknown";
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
    return "unknown";
}
