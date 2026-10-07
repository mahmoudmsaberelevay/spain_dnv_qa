// @ts-nocheck
// Renders ELEVAY design text with the official TrueType font in plain JavaScript, for servers whose
// FFmpeg build has no `drawtext` filter. Output is raw RGBA (white text, anti-aliased alpha) that FFmpeg
// overlays as a `rawvideo` input. Supports TrueType outlines (glyf), cmap formats 4 and 12, composite glyphs.

type Pt = { x: number; y: number; on: boolean };

export function parseFont(buf: Buffer) {
  const u16 = (o) => buf.readUInt16BE(o), i16 = (o) => buf.readInt16BE(o), u32 = (o) => buf.readUInt32BE(o);
  const tables: Record<string, number> = {};
  const n = u16(4);
  for (let i = 0; i < n; i++) { const r = 12 + i * 16; tables[buf.toString("latin1", r, r + 4)] = u32(r + 8); }
  for (const t of ["head", "hhea", "hmtx", "maxp", "cmap", "loca", "glyf"]) if (tables[t] == null) throw new Error(`Font is missing its ${t} table.`);
  const unitsPerEm = u16(tables.head + 18), longLoca = i16(tables.head + 50) === 1;
  const ascender = i16(tables.hhea + 4), descender = i16(tables.hhea + 6), lineGap = i16(tables.hhea + 8), numHMetrics = u16(tables.hhea + 34);
  const numGlyphs = u16(tables.maxp + 4);
  const loca = (g) => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2);
  const advance = (g) => u16(tables.hmtx + Math.min(g, numHMetrics - 1) * 4);

  // cmap: prefer a Unicode format-12 subtable, else format 4
  const cmapBase = tables.cmap, nSub = u16(cmapBase + 2);
  let f4 = -1, f12 = -1;
  for (let i = 0; i < nSub; i++) {
    const pid = u16(cmapBase + 4 + i * 8), eid = u16(cmapBase + 6 + i * 8), off = cmapBase + u32(cmapBase + 8 + i * 8);
    const fmt = u16(off);
    if (fmt === 12 && (pid === 0 || (pid === 3 && eid === 10))) f12 = off;
    if (fmt === 4 && (pid === 0 || (pid === 3 && (eid === 1 || eid === 0)))) f4 = off;
  }
  const glyphIndex = (cp) => {
    if (f12 >= 0) {
      const groups = u32(f12 + 12);
      for (let i = 0; i < groups; i++) { const g = f12 + 16 + i * 12, s = u32(g), e = u32(g + 4); if (cp >= s && cp <= e) return u32(g + 8) + cp - s; }
    }
    if (f4 >= 0 && cp <= 0xffff) {
      const segX2 = u16(f4 + 6), ends = f4 + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let i = 0; i < segX2 / 2; i++) {
        if (cp > u16(ends + i * 2)) continue;
        const start = u16(starts + i * 2);
        if (cp < start) return 0;
        const delta = i16(deltas + i * 2), ro = u16(ranges + i * 2);
        if (!ro) return (cp + delta) & 0xffff;
        const gi = u16(ranges + i * 2 + ro + (cp - start) * 2);
        return gi ? (gi + delta) & 0xffff : 0;
      }
    }
    return 0;
  };

  const contours = (g, depth = 0): Pt[][] => {
    if (g < 0 || g >= numGlyphs || depth > 6) return [];
    const start = loca(g), end = loca(g + 1);
    if (end <= start) return [];
    const o = tables.glyf + start, nc = i16(o);
    if (nc >= 0) {
      const endPts = []; for (let i = 0; i < nc; i++) endPts.push(u16(o + 10 + i * 2));
      const nPts = nc ? endPts[nc - 1] + 1 : 0;
      let p = o + 10 + nc * 2; p += 2 + u16(p);
      const flags = [];
      while (flags.length < nPts) { const f = buf[p++]; flags.push(f); if (f & 8) { let r = buf[p++]; while (r--) flags.push(f); } }
      const xs = [], ys = []; let v = 0;
      for (const f of flags) { if (f & 2) { const d = buf[p++]; v += f & 16 ? d : -d; } else if (!(f & 16)) { v += i16(p); p += 2; } xs.push(v); }
      v = 0;
      for (const f of flags) { if (f & 4) { const d = buf[p++]; v += f & 32 ? d : -d; } else if (!(f & 32)) { v += i16(p); p += 2; } ys.push(v); }
      const out = []; let s = 0;
      for (const e of endPts) { const c = []; for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) }); out.push(c); s = e + 1; }
      return out;
    }
    // composite glyph: offsets (and simple scale) only
    const out = []; let p = o + 10, more = true;
    while (more) {
      const flags = u16(p), gi = u16(p + 2); p += 4;
      let dx, dy;
      if (flags & 1) { dx = i16(p); dy = i16(p + 2); p += 4; } else { dx = buf.readInt8(p); dy = buf.readInt8(p + 1); p += 2; }
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (q) => i16(q) / 16384;
      if (flags & 8) { a = d = f2(p); p += 2; } else if (flags & 0x40) { a = f2(p); d = f2(p + 2); p += 4; } else if (flags & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      for (const ct of contours(gi, depth + 1)) out.push(ct.map((pt) => ({ x: pt.x * a + pt.y * c + (flags & 2 ? dx : 0), y: pt.x * b + pt.y * d + (flags & 2 ? dy : 0), on: pt.on })));
      more = !!(flags & 0x20);
    }
    return out;
  };

  return { unitsPerEm, ascender, descender, lineGap, glyphIndex, advance, contours };
}

/** Polygon edges (in pixels, y down) for one glyph at an origin, with quadratic curves flattened. */
function glyphEdges(contours: Pt[][], scale: number, ox: number, oy: number, edges: number[]) {
  for (const c of contours) {
    if (!c.length) continue;
    // expand implied on-curve points
    const pts: Pt[] = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      pts.push(a);
      if (!a.on && !b.on) pts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
    }
    let startIdx = pts.findIndex((p) => p.on);
    if (startIdx < 0) continue;
    const seq = pts.slice(startIdx).concat(pts.slice(0, startIdx));
    const T = (p) => [ox + p.x * scale, oy - p.y * scale];
    let [px, py] = T(seq[0]);
    const line = (x, y) => { edges.push(px, py, x, y); px = x; py = y; };
    for (let i = 1; i <= seq.length; i++) {
      const p = seq[i % seq.length];
      if (p.on) { const [x, y] = T(p); line(x, y); }
      else {
        const q = seq[(i + 1) % seq.length];
        const [cx, cy] = T(p), [ex, ey] = T(q);
        const sx = px, sy = py, steps = 8;
        for (let k = 1; k <= steps; k++) { const t = k / steps, mt = 1 - t; line(mt * mt * sx + 2 * mt * t * cx + t * t * ex, mt * mt * sy + 2 * mt * t * cy + t * t * ey); }
        i++;
      }
    }
  }
}

/** Raster of the given lines: white text with anti-aliased alpha, nonzero fill, 4×4 supersampling. */
export function renderTextRGBA(fontBuf: Buffer, lines: string[], fontSize: number, lineSpacing: number, maxWidth?: number) {
  const f = parseFont(fontBuf);
  const scale = fontSize / f.unitsPerEm;
  const asc = f.ascender * scale, desc = -f.descender * scale;
  const lineH = Math.ceil(asc + desc + lineSpacing);
  const widths = lines.map((l) => [...l].reduce((w, ch) => w + f.advance(f.glyphIndex(ch.codePointAt(0))) * scale, 0));
  const W = Math.ceil(Math.min(maxWidth || Infinity, Math.max(1, ...widths)) + 4), H = Math.ceil(lineH * lines.length - lineSpacing + 4);
  const edges: number[] = [];
  lines.forEach((l, li) => {
    let x = 1; const base = 2 + asc + li * lineH;
    for (const ch of l) { const g = f.glyphIndex(ch.codePointAt(0)); glyphEdges(f.contours(g), scale, x, base, edges); x += f.advance(g) * scale; }
  });
  const SS = 4, cover = new Float32Array(W * H);
  const xs: { x: number; w: number }[] = [];
  for (let sy = 0; sy < H * SS; sy++) {
    const y = (sy + 0.5) / SS;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const y0 = edges[e + 1], y1 = edges[e + 3];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) { const t = (y - y0) / (y1 - y0); xs.push({ x: edges[e] + t * (edges[e + 2] - edges[e]), w: y1 > y0 ? 1 : -1 }); }
    }
    if (!xs.length) continue;
    xs.sort((a, b) => a.x - b.x);
    const row = Math.floor(sy / SS) * W;
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k].w;
      if (!wind) continue;
      const a = Math.max(0, xs[k].x), b = Math.min(W, xs[k + 1].x);
      if (b <= a) continue;
      // horizontal coverage with fractional ends
      const ia = Math.floor(a), ib = Math.floor(b);
      if (ia === ib) { cover[row + ia] += (b - a) / SS; continue; }
      cover[row + ia] += (ia + 1 - a) / SS;
      for (let px = ia + 1; px < ib; px++) cover[row + px] += 1 / SS;
      if (ib < W) cover[row + ib] += (b - ib) / SS;
    }
  }
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) { const a = Math.min(1, cover[i]); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = Math.round(a * 255); }
  return { rgba, width: W, height: H };
}
