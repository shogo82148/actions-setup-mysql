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
const core = __importStar(require("@actions/core"));
const installer = __importStar(require("./installer"));
const starter = __importStar(require("./starter"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const version = core.getInput('mysql-version');
            const distribution = core.getInput('distribution');
            const autoStart = parseBoolean(core.getInput('auto-start'));
            const cnf = core.getInput('my-cnf');
            const rootPassword = core.getInput('root-password');
            const user = core.getInput('user');
            const password = core.getInput('password');
            const mysql = yield core.group('install MySQL', () => __awaiter(this, void 0, void 0, function* () {
                return installer.getMySQL(distribution, version);
            }));
            if (autoStart) {
                const state = yield starter.startMySQL(mysql, cnf, rootPassword);
                if (user) {
                    yield core.group('create new user', () => __awaiter(this, void 0, void 0, function* () {
                        yield starter.createUser(state, user, password);
                    }));
                }
                starter.saveState(state);
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
function parseBoolean(s) {
    switch (s) {
        case 'y':
        case 'Y':
        case 'yes':
        case 'Yes':
        case 'YES':
        case 'true':
        case 'True':
        case 'TRUE':
            return true;
        case 'n':
        case 'N':
        case 'no':
        case 'No':
        case 'NO':
        case 'false':
        case 'False':
        case 'FALSE':
            return false;
    }
    throw `invalid boolean value: ${s}`;
}
run();
