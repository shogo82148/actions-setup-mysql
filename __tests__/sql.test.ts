import * as sql from "../src/sql.js";

describe("quoting SQL string literals", () => {
  it("quotes plain strings", () => {
    expect(sql.quote("")).toBe("''");
    expect(sql.quote("password")).toBe("'password'");
  });

  it("escapes single quotes", () => {
    expect(sql.quote("it's")).toBe("'it''s'");
    expect(sql.quote("' OR '1'='1")).toBe("''' OR ''1''=''1'");
  });

  it("escapes backslashes", () => {
    expect(sql.quote("a\\b")).toBe("'a\\\\b'");
    expect(sql.quote("\\'")).toBe("'\\\\'''");
  });

  it("quotes account names", () => {
    expect(sql.account("user", "localhost")).toBe("'user'@'localhost'");
    expect(sql.account("o'neil", "::1")).toBe("'o''neil'@'::1'");
  });
});
