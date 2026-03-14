type MyCnf = {
    [group: string]: {
        [key: string]: string;
    };
};
export declare function parse(cnf: string): MyCnf;
export declare function stringify(cnf: MyCnf): string;
export {};
