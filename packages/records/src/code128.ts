// Pure, deterministic Code 128 encoder (ADR-0065). Code sets B and C with
// automatic subset choice for digit runs, the modulo-103 checksum, start/stop
// symbols and quiet zones. Output is a bar/space MODULE bitstring and a rendered
// SVG string — no I/O, no dependencies. Held to 100% coverage and tested against
// known-good vectors (checksum + start/stop symbols verified explicitly).
//
// Reference: the 108-symbol Code 128 pattern table (values 0..106). Each entry
// is six element widths (bar,space,bar,space,bar,space) summing to 11 modules;
// the stop symbol (106) carries a seventh element (the extra terminating bar).

/** The canonical Code 128 width patterns, indexed by symbol value 0..106. */
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

export interface Code128 {
  /** Symbol values in order: [start, ...data, checksum, stop]. */
  readonly values: readonly number[];
  /** The Code 128 modulo-103 checksum symbol value. */
  readonly checksum: number;
  /** Bar/space module bitstring ('1' = bar module, '0' = space module),
   *  WITHOUT quiet zones — those are added by the renderer. */
  readonly modules: string;
}

/** How many consecutive ASCII digits appear starting at `pos`. */
function digitsAt(data: string, pos: number): number {
  let n = 0;
  while (pos + n < data.length) {
    const c = data.charCodeAt(pos + n);
    if (c < 48 || c > 57) break;
    n += 1;
  }
  return n;
}

/** Encode a string as Code 128 (subsets B/C, auto subset choice). Throws on an
 *  empty string or a character outside the printable ASCII range 32..126. */
export function encodeCode128(data: string): Code128 {
  if (data.length === 0) {
    throw new Error("code128: cannot encode an empty string");
  }
  for (let i = 0; i < data.length; i += 1) {
    const c = data.charCodeAt(i);
    if (c < 32 || c > 126) {
      throw new Error("code128: unsupported character (only ASCII 32..126)");
    }
  }

  const codes: number[] = [];
  const len = data.length;
  const lead = digitsAt(data, 0);
  // Start in Code C for an all-digit even-length payload, or a long leading
  // digit run (Code C packs two digits per symbol); otherwise Code B.
  let mode: "B" | "C";
  if ((lead === len && len % 2 === 0) || lead >= 4) {
    mode = "C";
    codes.push(START_C);
  } else {
    mode = "B";
    codes.push(START_B);
  }

  let pos = 0;
  while (pos < len) {
    if (mode === "C") {
      if (digitsAt(data, pos) >= 2) {
        codes.push(Number(data.slice(pos, pos + 2)));
        pos += 2;
      } else {
        // A single trailing/interrupting digit or a letter — drop back to B.
        mode = "B";
        codes.push(CODE_B);
      }
    } else {
      const dig = digitsAt(data, pos);
      const atEnd = pos + dig === len;
      // Switch to Code C for a worthwhile digit run (≥4 at the end, ≥6 mid-string).
      if ((atEnd && dig >= 4) || (!atEnd && dig >= 6)) {
        mode = "C";
        codes.push(CODE_C);
      } else {
        codes.push(data.charCodeAt(pos) - 32);
        pos += 1;
      }
    }
  }

  // Modulo-103 checksum: start value (weight 1) + each data value × its position.
  let sum = codes[0]!; // the start symbol is always present
  for (let i = 1; i < codes.length; i += 1) {
    sum += codes[i]! * i;
  }
  const checksum = sum % 103;
  codes.push(checksum);
  codes.push(STOP);

  return { values: codes, checksum, modules: modulesFor(codes) };
}

/** Expand a symbol-value sequence into a bar/space module bitstring. */
function modulesFor(values: readonly number[]): string {
  let bits = "";
  for (const v of values) {
    const widths = PATTERNS[v]!; // v is always an internally-produced symbol 0..106
    let bar = true;
    for (const ch of widths) {
      bits += (bar ? "1" : "0").repeat(Number(ch));
      bar = !bar;
    }
  }
  return bits;
}

export interface Code128SvgOptions {
  /** Pixel width of a single module (bar unit). Default 2. */
  readonly moduleWidth?: number;
  /** Barcode height in pixels. Default 60. */
  readonly height?: number;
  /** Quiet-zone width in modules on each side (spec minimum 10). Default 10. */
  readonly quietZone?: number;
  /** Render the human-readable text under the bars. Default false. */
  readonly showText?: boolean;
}

/** Render a Code 128 barcode for `data` as a self-contained, deterministic SVG
 *  string (black bars on a white field, quiet zones included). */
export function code128Svg(data: string, options: Code128SvgOptions = {}): string {
  const moduleWidth = options.moduleWidth ?? 2;
  const height = options.height ?? 60;
  const quietZone = options.quietZone ?? 10;
  const showText = options.showText ?? false;

  const { modules } = encodeCode128(data);
  const textBand = showText ? 20 : 0;
  const totalModules = modules.length + quietZone * 2;
  const width = totalModules * moduleWidth;
  const svgHeight = height + textBand;

  const bars: string[] = [];
  let run = 0;
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] === "1") {
      run += 1;
    } else if (run > 0) {
      bars.push(rect((quietZone + i - run) * moduleWidth, run * moduleWidth, height));
      run = 0;
    }
  }
  if (run > 0) {
    bars.push(rect((quietZone + modules.length - run) * moduleWidth, run * moduleWidth, height));
  }

  const text = showText
    ? `<text x="${width / 2}" y="${height + 15}" text-anchor="middle" font-family="monospace" font-size="14">${escapeXml(data)}</text>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}" role="img" aria-label="barcode ${escapeXml(data)}">` +
    `<rect x="0" y="0" width="${width}" height="${svgHeight}" fill="#ffffff"/>` +
    bars.join("") +
    text +
    `</svg>`
  );
}

function rect(x: number, width: number, height: number): string {
  return `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000"/>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "&") return "&amp;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}
