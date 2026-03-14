import * as installer from "./installer.js";
export interface MySQLState {
    pid: number;
    pidFile: string;
    baseDir: string;
    toolPath: string;
    rootPassword: string;
}
export declare function saveState(state: MySQLState): void;
export declare function getState(): MySQLState | null;
export declare function startMySQL(mysql: installer.MySQL, cnf: string, rootPassword: string): Promise<MySQLState>;
export declare function createUser(state: MySQLState, user: string, password: string): Promise<void>;
