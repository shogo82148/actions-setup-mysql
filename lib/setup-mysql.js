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
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const installer = __importStar(require("./installer"));
const starter = __importStar(require("./starter"));
async function run() {
    try {
        const version = core.getInput("mysql-version");
        const distribution = core.getInput("distribution");
        const autoStart = core.getBooleanInput("auto-start");
        const cnf = core.getInput("my-cnf");
        const rootPassword = core.getInput("root-password");
        const user = core.getInput("user");
        const password = core.getInput("password");
        const mysql = await core.group("install MySQL", async () => {
            return installer.getMySQL(distribution, version);
        });
        if (autoStart) {
            const state = await starter.startMySQL(mysql, cnf, rootPassword);
            if (user) {
                await core.group("create new user", async () => {
                    await starter.createUser(state, user, password);
                });
            }
            starter.saveState(state);
        }
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message);
        }
        else {
            core.setFailed(`${error}`);
        }
    }
}
void run();
