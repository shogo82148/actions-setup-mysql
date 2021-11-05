// parse and stringify my.cnf
// https://dev.mysql.com/doc/refman/8.0/en/option-files.html
// https://mariadb.com/kb/en/configuring-mariadb-with-option-files/

type MyCnf = { [group: string]: { [key: string]: string } };

// parse my.cnf
export function parse(cnf: string): MyCnf {
  const parser = new Parser(cnf);
  return parser.parse();
}

export function stringify(cnf: MyCnf): string {
  const lines: string[] = [];
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

const EOF = "EOF";

const isWhitespace = (ch: string): boolean => {
  return ch === "\t" || ch === "\n" || ch === "\v" || ch === "\f" || ch === "\r" || ch === " ";
};

const isWhitespaceWithoutEOL = (ch: string): boolean => {
  return ch === "\t" || ch === "\v" || ch === "\f" || ch === " ";
};

class Parser {
  data: string[];
  idx: number;
  group = "";
  result: MyCnf = {};

  constructor(cnf: string) {
    this.data = [...cnf];
    this.idx = 0;
  }

  peek(): string {
    if (this.idx >= this.data.length) {
      return EOF;
    }
    return this.data[this.idx];
  }

  next(): void {
    this.idx++;
  }

  skipWhitespace(): void {
    while (isWhitespace(this.peek())) {
      this.next();
    }
  }

  skipWhitespaceWithoutEOL(): void {
    while (isWhitespaceWithoutEOL(this.peek())) {
      this.next();
    }
  }

  skipToEOL(): void {
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
    } else if (this.peek() === "\r" || this.peek() === "\n" || this.peek() === EOF) {
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
    } else {
      throw new Error(`unexpected character: "${this.peek()}"`);
    }
  }

  // `[group]`
  parseGroup(): void {
    if (this.peek() !== "[") {
      throw new Error(`unexpected section start: "${this.peek()}"`);
    }
    this.next();

    // parse group
    let group = "";
    const buf: string[] = [];
    for (;;) {
      const ch = this.peek();
      if (ch === "]") {
        // end of group
        this.next();
        group = buf.join("").toLowerCase();
        break;
      } else if (ch === "\n" || ch === "\r") {
        throw new Error("unexpected new line");
      } else if (this.peek() === EOF) {
        throw new Error("unexpected end of file");
      } else {
        buf.push(ch);
        this.next();
      }
    }

    this.skipToEOL();
    this.group = group;
  }

  parseOptionName(): string {
    const buf: string[] = [];
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

  getChar(): string {
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

  parseOptionValue(): string {
    if (this.peek() !== "=") {
      // in case of `opt_name`
      return "";
    }
    this.next();

    this.skipWhitespaceWithoutEOL();
    const buf: string[] = [];
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
        this.skipToEOL();
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
        this.skipToEOL();
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

  parseOption(): void {
    const name = this.parseOptionName();
    const value = this.parseOptionValue();
    this.skipToEOL();
    this.result[this.group] ||= {};
    this.result[this.group][name] = value;
  }

  parse(): MyCnf {
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
