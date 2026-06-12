import { describe, expect, it } from "vitest";
import { isOk, unwrap } from "@oxford/core";
import { serviceInfo } from "./index.js";

describe("serviceInfo", () => {
  it("reports the api as ok", () => {
    const r = serviceInfo();
    expect(isOk(r)).toBe(true);
    expect(unwrap(r)).toEqual({ name: "oxford-his-api", status: "ok" });
  });
});
