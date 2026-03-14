export interface MySQL {
    distribution: string;
    version: string;
    toolPath: string;
}
export declare function getMySQL(distribution: string, version: string, githubToken: string): Promise<MySQL>;
