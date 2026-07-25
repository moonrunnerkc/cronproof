/**
 * Binary parser for TZif files (RFC 8536), the compiled zoneinfo
 * format produced by zic. Reads version 2 and later files: the
 * 32-bit version 1 block is skipped, the 64-bit block supplies the
 * transition table, leap-second records are ignored, and the POSIX
 * TZ footer string is captured for extrapolation past the last
 * recorded transition.
 */

/** One local-time type from a TZif file. */
export interface TzifType {
  /** UTC offset in seconds, east positive. */
  offsetSeconds: number;
  /** Daylight-saving flag exactly as stored in the file. */
  isDst: boolean;
  /** Zone designation, for example "EST" or "+11". */
  abbreviation: string;
}

/** Parsed contents of one TZif file's 64-bit data block. */
export interface TzifData {
  /** TZif format version character: "2", "3", or "4". */
  version: string;
  /** Transition instants in UTC milliseconds, ascending. */
  transitionMillis: number[];
  /** Index into `types` for the interval after each transition. */
  transitionTypes: number[];
  /** All local-time types defined by the file. */
  types: TzifType[];
  /** Index of the type in effect before the first transition. */
  firstTypeIndex: number;
  /** POSIX TZ footer string, or null when the footer is empty. */
  posixTzString: string | null;
}

interface Header {
  version: string;
  isutcnt: number;
  isstdcnt: number;
  leapcnt: number;
  timecnt: number;
  typecnt: number;
  charcnt: number;
}

function readHeader(view: DataView, at: number): Header {
  const magic = String.fromCharCode(
    view.getUint8(at),
    view.getUint8(at + 1),
    view.getUint8(at + 2),
    view.getUint8(at + 3),
  );
  if (magic !== 'TZif') {
    throw new Error('not a TZif file: bad magic');
  }
  const versionByte = view.getUint8(at + 4);
  return {
    version: versionByte === 0 ? '1' : String.fromCharCode(versionByte),
    isutcnt: view.getUint32(at + 20),
    isstdcnt: view.getUint32(at + 24),
    leapcnt: view.getUint32(at + 28),
    timecnt: view.getUint32(at + 32),
    typecnt: view.getUint32(at + 36),
    charcnt: view.getUint32(at + 40),
  };
}

const HEADER_BYTES = 44;

function dataBlockBytes(header: Header, timeBytes: number): number {
  return (
    header.timecnt * timeBytes +
    header.timecnt +
    header.typecnt * 6 +
    header.charcnt +
    header.leapcnt * (timeBytes + 4) +
    header.isstdcnt +
    header.isutcnt
  );
}

function decodeAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join('');
}

function abbreviationAt(chars: string, index: number): string {
  const end = chars.indexOf('\0', index);
  return end === -1 ? chars.slice(index) : chars.slice(index, end);
}

/**
 * Parses a TZif version 2 or later file. Throws on version 1 files
 * (no 64-bit block) and on structurally invalid input.
 */
export function parseTzif(buffer: Uint8Array): TzifData {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const v1Header = readHeader(view, 0);
  if (v1Header.version === '1') {
    throw new Error('TZif version 1 file has no 64-bit data block');
  }
  const v2Start = HEADER_BYTES + dataBlockBytes(v1Header, 4);
  const header = readHeader(view, v2Start);
  let at = v2Start + HEADER_BYTES;

  const transitionMillis: number[] = [];
  for (let i = 0; i < header.timecnt; i += 1) {
    transitionMillis.push(Number(view.getBigInt64(at)) * 1000);
    at += 8;
  }
  const transitionTypes: number[] = [];
  for (let i = 0; i < header.timecnt; i += 1) {
    transitionTypes.push(view.getUint8(at));
    at += 1;
  }
  const rawTypes: { offsetSeconds: number; isDst: boolean; desigIndex: number }[] = [];
  for (let i = 0; i < header.typecnt; i += 1) {
    rawTypes.push({
      offsetSeconds: view.getInt32(at),
      isDst: view.getUint8(at + 4) !== 0,
      desigIndex: view.getUint8(at + 5),
    });
    at += 6;
  }
  const chars = decodeAscii(buffer.subarray(at, at + header.charcnt));
  at += header.charcnt;
  at += header.leapcnt * 12 + header.isstdcnt + header.isutcnt;

  const types: TzifType[] = rawTypes.map((raw) => ({
    offsetSeconds: raw.offsetSeconds,
    isDst: raw.isDst,
    abbreviation: abbreviationAt(chars, raw.desigIndex),
  }));

  let posixTzString: string | null = null;
  if (at < buffer.byteLength && view.getUint8(at) === 0x0a) {
    const rest = buffer.subarray(at + 1);
    const newline = rest.indexOf(0x0a);
    const footer = decodeAscii(newline === -1 ? rest : rest.subarray(0, newline));
    posixTzString = footer.length > 0 ? footer : null;
  }

  /*
   * RFC 8536 section 3.2: "Local time for timestamps before the
   * first transition is specified by the first time type (time
   * type 0)." Fetched 2026-07-25:
   * https://www.rfc-editor.org/rfc/rfc8536
   */
  return {
    version: header.version,
    transitionMillis,
    transitionTypes,
    types,
    firstTypeIndex: 0,
    posixTzString,
  };
}
