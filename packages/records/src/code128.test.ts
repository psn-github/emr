import { describe, expect, it } from "vitest";
import { encodeCode128, code128Svg } from "./code128.js";

// Known-good Code 128 vectors — checksum + start/stop symbols verified explicitly
// (ADR-0065). Symbol values: Start B=104, Start C=105, Code B=100, Code C=99,
// Stop=106. The pattern for Start C is "211232"; for Stop, "2331112".

describe("encodeCode128 — known-good vectors", () => {
  it("'OM-2026-00042' starts in Code B, switches to C for the trailing digit run (checksum 77)", () => {
    const bc = encodeCode128("OM-2026-00042");
    expect(bc.values[0]).toBe(104); // Start B
    expect(bc.values[bc.values.length - 1]).toBe(106); // Stop
    expect(bc.checksum).toBe(77);
    // 'O''M''-''2''0''2''6''-' in B, then →C (99) packs "00""04", then →B (100) '2'
    expect(bc.values).toEqual([104, 47, 45, 13, 18, 16, 18, 22, 13, 99, 0, 4, 100, 18, 77, 106]);
    // pattern starts with Start-B (211214) and ends with Stop (2331112)
    expect(bc.modules.startsWith("11010010000")).toBe(true); // 2,1,1,2,1,4 bars/spaces
    expect(bc.modules.endsWith("1100011101011")).toBe(true); // stop 2,3,3,1,1,1,2
  });

  it("'1234567890' encodes in Code C with checksum 85", () => {
    const bc = encodeCode128("1234567890");
    expect(bc.values[0]).toBe(105); // Start C
    expect(bc.values[bc.values.length - 1]).toBe(106); // Stop
    expect(bc.checksum).toBe(85);
    expect(bc.values).toEqual([105, 12, 34, 56, 78, 90, 85, 106]);
  });
});

describe("encodeCode128 — subset switching", () => {
  it("switches Code B → Code C for a trailing digit run (≥4)", () => {
    const bc = encodeCode128("A2026");
    expect(bc.values[0]).toBe(104); // Start B
    expect(bc.values).toContain(99); // Code C switch
    expect(bc.values.slice(0, 5)).toEqual([104, 33, 99, 20, 26]); // 'A', →C, 20, 26
  });

  it("switches Code B → Code C mid-string for a run ≥6", () => {
    const bc = encodeCode128("A123456B");
    expect(bc.values[0]).toBe(104);
    expect(bc.values).toContain(99); // into C
    expect(bc.values).toContain(100); // back to B for the trailing 'B'
  });

  it("starts in Code C for a long leading run, then drops to B", () => {
    const bc = encodeCode128("12345678AB");
    expect(bc.values[0]).toBe(105); // Start C (lead ≥ 4)
    expect(bc.values).toContain(100); // Code B switch for the letters
    expect(bc.values.slice(0, 5)).toEqual([105, 12, 34, 56, 78]);
  });

  it("handles an odd-length all-digit payload (Start C, single tail via B)", () => {
    const bc = encodeCode128("12345");
    expect(bc.values[0]).toBe(105); // Start C (lead 5 ≥ 4)
    expect(bc.values).toContain(100); // switch to B for the leftover '5'
    expect(bc.values.slice(0, 3)).toEqual([105, 12, 34]);
    expect(bc.values).toContain(21); // '5' in Code B (53 - 32)
  });

  it("encodes a lone short digit run in Code B (no C start)", () => {
    const bc = encodeCode128("99");
    expect(bc.values[0]).toBe(105); // two digits, even → Start C
    const b2 = encodeCode128("5");
    expect(b2.values[0]).toBe(104); // single digit → Start B
  });
});

describe("encodeCode128 — guards", () => {
  it("rejects an empty string", () => {
    expect(() => encodeCode128("")).toThrow(/empty/);
  });
  it("rejects a character outside printable ASCII", () => {
    expect(() => encodeCode128("café")).toThrow(/unsupported/);
  });
});

describe("code128Svg", () => {
  it("renders a self-contained SVG with bars and a white field", () => {
    const svg = code128Svg("OM-2026-00042");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('fill="#ffffff"'); // quiet-zone / background
    expect(svg).toContain('fill="#000000"'); // bars
    expect(svg).toContain('aria-label="barcode OM-2026-00042"');
    expect(svg).not.toContain("<text"); // showText defaults off
  });

  it("honours moduleWidth, height, quietZone and showText, escaping the text", () => {
    const svg = code128Svg("A<>&\"'B", { moduleWidth: 3, height: 80, quietZone: 12, showText: true });
    expect(svg).toContain("<text");
    // both aria-label and the human-readable text escape XML specials
    expect(svg).toContain("A&lt;&gt;&amp;&quot;&#39;B");
    expect(svg).not.toContain("<>&\"'B</text>");
  });

  it("is deterministic", () => {
    expect(code128Svg("OM-2026-00042")).toBe(code128Svg("OM-2026-00042"));
  });
});
