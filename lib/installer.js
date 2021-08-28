"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMySQL = void 0;
const core = __importStar(require("@actions/core"));
const tc = __importStar(require("@actions/tool-cache"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const semver = __importStar(require("semver"));
const osPlat = os.platform();
const osArch = os.arch();
function getAvailableVersions(distribution) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            fs.readFile(path.join(__dirname, '..', 'versions', `${distribution}.json`), (err, data) => {
                if (err) {
                    reject(err);
                }
                const info = JSON.parse(data.toString());
                resolve(info);
            });
        });
    });
}
function determineVersion(distribution, version) {
    return __awaiter(this, void 0, void 0, function* () {
        if (version.startsWith('mysql-')) {
            distribution = 'mysql';
            version = version.substring('mysql-'.length);
        }
        else if (version.startsWith('mariadb-')) {
            distribution = 'mariadb';
            version = version.substring('mariadb-'.length);
        }
        const availableVersions = yield getAvailableVersions(distribution);
        for (let v of availableVersions) {
            if (semver.satisfies(v, version)) {
                return {
                    distribution: distribution,
                    version: v,
                    toolPath: ''
                };
            }
        }
        throw new Error('unable to get latest version');
    });
}
function getMySQL(distribution, version) {
    return __awaiter(this, void 0, void 0, function* () {
        const selected = yield determineVersion(distribution, version);
        // check cache
        let toolPath;
        toolPath = tc.find(selected.distribution, selected.version);
        if (!toolPath) {
            // download, extract, cache
            toolPath = yield acquireMySQL(selected.distribution, selected.version);
            core.debug('MySQL tool is cached under ' + toolPath);
        }
        //
        // prepend the tools path. instructs the agent to prepend for future tasks
        //
        const bin = path.join(toolPath, 'bin');
        core.addPath(bin);
        return {
            distribution: selected.distribution,
            version: selected.version,
            toolPath: toolPath
        };
    });
}
exports.getMySQL = getMySQL;
function acquireMySQL(distribution, version) {
    return __awaiter(this, void 0, void 0, function* () {
        //
        // Download - a tool installer intimately knows how to get the tool (and construct urls)
        //
        const fileName = getFileName(distribution, version);
        const downloadUrl = yield getDownloadUrl(fileName);
        let downloadPath = null;
        try {
            core.info(`downloading from ${downloadUrl}`);
            downloadPath = yield tc.downloadTool(downloadUrl);
        }
        catch (error) {
            if (error instanceof Error) {
                core.info(error.message);
            }
            else {
                core.info(`${error}`);
            }
            throw `Failed to download version ${version}: ${error}`;
        }
        //
        // Extract XZ compressed tar
        //
        const extPath = downloadUrl.endsWith('.zip')
            ? yield tc.extractZip(downloadPath)
            : downloadUrl.endsWith('.tar.xz')
                ? yield tc.extractTar(downloadPath, '', 'xJ')
                : downloadUrl.endsWith('.tar.bz2')
                    ? yield tc.extractTar(downloadPath, '', 'xj')
                    : yield tc.extractTar(downloadPath);
        return yield tc.cacheDir(extPath, distribution, version);
    });
}
function getFileName(distribution, version) {
    const ext = osPlat === 'win32' ? 'zip' : 'tar.xz';
    return `${distribution}-${version}-${osPlat}-${osArch}.${ext}`;
}
function getDownloadUrl(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            fs.readFile(path.join(__dirname, '..', 'package.json'), (err, data) => {
                if (err) {
                    reject(err);
                }
                const info = JSON.parse(data.toString());
                resolve(info);
            });
        }).then(info => {
            const actionsVersion = info.version;
            return `https://setupmysql.blob.core.windows.net/actions-setup-mysql/v${actionsVersion}/${filename}`;
        });
    });
}
