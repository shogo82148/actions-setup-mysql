"use strict";
// parse and stringify my.cnf
// https://dev.mysql.com/doc/refman/8.0/en/option-files.html
// https://mariadb.com/kb/en/configuring-mariadb-with-option-files/
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringify = exports.parse = void 0;
// parse my.cnf
function parse(cnf) {
    const parser = new Parser(cnf);
    return parser.parse();
}
exports.parse = parse;
function stringify(cnf) {
    const lines = [];
    const groupKeys = Object.keys(cnf);
    groupKeys.sort(undefined);
    for (const groupKey of groupKeys) {
        lines.push(`[${groupKey}]`);
        const obj = cnf[groupKey];
        const keys = Object.keys(obj);
        keys.sort(undefined);
        for (const key of keys) {
            let value = obj[key];
            value = value.replace(/\\/g, "\\\\");
            value = value.replace(/"/g, '\\"');
            value = value.replace(/'/g, "\\'");
            value = value.replace(/\n/g, "\\n");
            value = value.replace(/\r/g, "\\r");
            value = value.replace(/\t/g, "\\t");
            value = value.replace(/[\b]/g, "\\b");
            lines.push(`${key}="${value}"`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
exports.stringify = stringify;
const EOF = "EOF";
const isWhitespace = (ch) => {
    return ch === "\t" || ch === "\n" || ch === "\v" || ch === "\f" || ch === "\r" || ch === " ";
};
const isWhitespaceWithoutEOL = (ch) => {
    return ch === "\t" || ch === "\v" || ch === "\f" || ch === " ";
};
class Parser {
    constructor(cnf) {
        this.group = "";
        this.result = {};
        this.data = [...cnf];
        this.idx = 0;
    }
    peek() {
        if (this.idx >= this.data.length) {
            return EOF;
        }
        return this.data[this.idx];
    }
    next() {
        this.idx++;
    }
    skipWhitespace() {
        while (isWhitespace(this.peek())) {
            this.next();
        }
    }
    skipWhitespaceWithoutEOL() {
        while (isWhitespaceWithoutEOL(this.peek())) {
            this.next();
        }
    }
    skipToEOL() {
        this.skipWhitespaceWithoutEOL();
        if (this.peek() === "#") {
            // skip comment
            for (;;) {
                const ch = this.peek();
                if (ch === EOF) {
                    return;
                }
                this.next();
                if (ch === "\n") {
                    return;
                }
            }
        }
        else if (this.peek() === "\r" || this.peek() === "\n" || this.peek() === EOF) {
            // EOL
            for (;;) {
                const ch = this.peek();
                if (ch === EOF) {
                    return;
                }
                this.next();
                if (ch === "\n") {
                    return;
                }
            }
        }
        else {
            throw new Error(`unexpected character: "${this.peek()}"`);
        }
    }
    // `[group]`
    parseGroup() {
        if (this.peek() !== "[") {
            throw new Error(`unexpected section start: "${this.peek()}"`);
        }
        this.next();
        // parse group
        let group = "";
        const buf = [];
        for (;;) {
            const ch = this.peek();
            if (ch === "]") {
                // end of group
                this.next();
                group = buf.join("").toLowerCase();
                break;
            }
            else if (ch === "\n" || ch === "\r") {
                throw new Error("unexpected new line");
            }
            else if (this.peek() === EOF) {
                throw new Error("unexpected end of file");
            }
            else {
                buf.push(ch);
                this.next();
            }
        }
        this.skipToEOL();
        this.group = group;
    }
    parseOptionName() {
        const buf = [];
        for (;;) {
            const ch = this.peek();
            if (ch === "=" || ch === "\r" || ch === "\n" || ch === EOF) {
                break;
            }
            buf.push(ch);
            this.next();
        }
        // trim suffix
        while (buf.length > 0 && isWhitespace(buf[buf.length - 1])) {
            buf.pop();
        }
        return buf.join("").toLowerCase();
    }
    getChar() {
        const ch = this.peek();
        if (ch === "\\") {
            this.next(); // skip '\\'
            switch (this.peek()) {
                case "n":
                    this.next();
                    return "\n";
                case "r":
                    this.next();
                    return "\r";
                case "t":
                    this.next();
                    return "\t";
                case "b":
                    this.next();
                    return "\b";
                case "s":
                    this.next();
                    return " ";
                case '"':
                    this.next();
                    return '"';
                case "'":
                    this.next();
                    return "'";
                case "\\":
                    this.next();
                    return "\\";
                default:
                    // unknown escape sequence
                    return "\\";
            }
        }
        this.next();
        return ch;
    }
    parseOptionValue() {
        if (this.peek() !== "=") {
            // in case of `opt_name`
            return "";
        }
        this.next();
        this.skipWhitespaceWithoutEOL();
        const buf = [];
        switch (this.peek()) {
            case '"':
                this.next(); // skip first '"'
                // read until correspond '"'
                for (;;) {
                    const ch = this.peek();
                    if (ch === '"') {
                        this.next();
                        break;
                    }
                    if (ch === "\r" || ch === "\n" || ch === EOF) {
                        throw new Error("unexpected EOL");
                    }
                    buf.push(this.getChar());
                }
                this.skipWhitespaceWithoutEOL();
                break;
            case "'":
                this.next(); // skip first "'"
                // read until correspond "'"
                for (;;) {
                    const ch = this.peek();
                    if (ch === "'") {
                        this.next();
                        break;
                    }
                    if (ch === "\r" || ch === "\n" || ch === EOF) {
                        throw new Error("unexpected EOL");
                    }
                    buf.push(this.getChar());
                }
                this.skipWhitespaceWithoutEOL();
                break;
            default:
                // read the value until EOL
                for (;;) {
                    const ch = this.peek();
                    if (ch === "\r" || ch === "\n" || ch === EOF) {
                        break;
                    }
                    buf.push(this.getChar());
                }
                // trim suffix
                while (buf.length > 0 && isWhitespace(buf[buf.length - 1])) {
                    buf.pop();
                }
        }
        return buf.join("");
    }
    parseOption() {
        var _a, _b;
        const name = this.parseOptionName();
        const value = this.parseOptionValue();
        this.skipToEOL();
        (_a = this.result)[_b = this.group] || (_a[_b] = {});
        this.result[this.group][name] = value;
    }
    parse() {
        for (;;) {
            this.skipWhitespace();
            switch (this.peek()) {
                case EOF:
                    return this.result;
                case "#":
                case ";":
                    // comment, skip this line
                    for (;;) {
                        const ch = this.peek();
                        if (ch === EOF) {
                            break;
                        }
                        this.next();
                        if (ch === "\n") {
                            break;
                        }
                    }
                    break;
                case "\r":
                case "\n":
                    // empty line
                    this.next();
                    break;
                case "[":
                    // [group]
                    this.parseGroup();
                    break;
                default:
                    // opt_name=value
                    this.parseOption();
            }
        }
    }
}
