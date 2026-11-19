// geo.js — Swiss coordinates, GeoJSON import from QGIS, QML styles, simplification.

// swisstopo approximate formulas (accuracy about 1 m) — LV95 (EPSG:2056) <-> WGS84
export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return [lon * 100 / 36, lat * 100 / 36];
}
export function wgs84ToLv95(lon, lat) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return [E, N];
}
export const lv03ToWgs84 = (y, x) => lv95ToWgs84(y + 2000000, x + 1000000);

// "2'643'797.89" -> 2643797.89
export const parseNumber = (s) => parseFloat(String(s).replace(/['’\s]/g, "").replace(",", "."));

// --- CRS detection: "crs" member (QGIS writes it for non-WGS84 exports) or coordinate size
export function detectCrs(gj) {
  const name = gj && gj.crs && gj.crs.properties && gj.crs.properties.name || "";
  if (/2056/.test(name)) return "EPSG:2056";
  if (/21781/.test(name)) return "EPSG:21781";
  if (/4326|CRS84/.test(name)) return "EPSG:4326";
  const c = firstCoord(gj);
  if (!c) return "EPSG:4326";
  if (c[0] > 2000000 && c[1] > 1000000) return "EPSG:2056";
  if (c[0] > 400000 && c[0] < 900000 && c[1] > 50000 && c[1] < 350000) return "EPSG:21781";
  return "EPSG:4326";
}
function firstCoord(gj) {
  let found = null;
  walkCoords(gj, (c) => { if (!found) found = c; return c; });
  return found;
}
function walkCoords(gj, fn) {
  const map = (c) => (typeof c[0] === "number" ? fn(c) : c.map(map));
  const geom = (g) => {
    if (!g) return g;
    if (g.type === "GeometryCollection") return { ...g, geometries: g.geometries.map(geom) };
    return { ...g, coordinates: map(g.coordinates) };
  };
  if (gj.type === "FeatureCollection") return { ...gj, features: gj.features.map((f) => ({ ...f, geometry: geom(f.geometry) })) };
  if (gj.type === "Feature") return { ...gj, geometry: geom(gj.geometry) };
  return geom(gj);
}

export function toWgs84(gj) {
  const crs = detectCrs(gj);
  let out = gj;
  if (crs === "EPSG:2056") out = walkCoords(gj, (c) => round6(lv95ToWgs84(c[0], c[1])));
  else if (crs === "EPSG:21781") out = walkCoords(gj, (c) => round6(lv03ToWgs84(c[0], c[1])));
  else out = walkCoords(gj, (c) => round6(c));
  out = { ...out }; delete out.crs;
  return { geojson: out, crs };
}
const round6 = (c) => [Math.round(c[0] * 1e6) / 1e6, Math.round(c[1] * 1e6) / 1e6];

// --- Douglas–Peucker; tolerance in degrees (0.0001 ≈ 10 m)
function dp(points, tol) {
  if (points.length < 3) return points;
  let maxD = 0, idx = 0;
  const [a, b] = [points[0], points[points.length - 1]];
  for (let i = 1; i < points.length - 1; i++) {
    const d = segDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [a, b];
  return dp(points.slice(0, idx + 1), tol).slice(0, -1).concat(dp(points.slice(idx), tol));
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function simplifyRing(ring, tol) {
  if (ring.length < 8 || tol <= 0) return ring;
  // closed ring: split at the point farthest from the start, simplify both halves
  let far = 1, maxD = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > maxD) { maxD = d; far = i; }
  }
  const out = dp(ring.slice(0, far + 1), tol).slice(0, -1).concat(dp(ring.slice(far), tol));
  return out.length >= 4 ? out : ring;
}
export function simplify(gj, tol) {
  if (!tol) return gj;
  const g = (geom) => {
    if (!geom) return geom;
    const t = geom.type, c = geom.coordinates;
    if (t === "LineString") return { ...geom, coordinates: dp(c, tol) };
    if (t === "MultiLineString") return { ...geom, coordinates: c.map((l) => dp(l, tol)) };
    if (t === "Polygon") return { ...geom, coordinates: c.map((r) => simplifyRing(r, tol)) };
    if (t === "MultiPolygon") return { ...geom, coordinates: c.map((p) => p.map((r) => simplifyRing(r, tol))) };
    return geom;
  };
  if (gj.type === "FeatureCollection") return { ...gj, features: gj.features.map((f) => ({ ...f, geometry: g(f.geometry) })) };
  return gj;
}

export function geomKind(gj) {
  const f = (gj.features || [])[0];
  const t = f && f.geometry && f.geometry.type || "";
  if (/Polygon/.test(t)) return "fill";
  if (/LineString/.test(t)) return "line";
  return "circle";
}
export function propertyNames(gj) {
  const s = new Set();
  for (const f of (gj.features || []).slice(0, 50)) Object.keys(f.properties || {}).forEach((k) => s.add(k));
  return [...s];
}
export function bbox(gj) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  walkCoords(gj, (c) => { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; return c; });
  return isFinite(b[0]) ? b : null;
}

// --- QGIS .qml (single symbol): fill colour, opacity, outline colour/width, point size
export function parseQml(xml) {
  const val = (names) => {
    for (const n of names) {
      const tag = new RegExp(`<[^>]*\\b(?:k|name)="${n}"[^>]*>`).exec(xml);
      const m = tag && /\b(?:v|value)="([^"]*)"/.exec(tag[0]);
      if (m) return m[1];
    }
    return null;
  };
  const rgba = (s) => {
    if (!s) return null;
    const p = s.split(",").map((x) => parseFloat(x));
    if (p.length < 3 || p.some((x, i) => i < 3 && isNaN(x))) return null;
    const hex = "#" + p.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
    return { hex, alpha: p.length > 3 && !isNaN(p[3]) ? p[3] / 255 : 1 };
  };
  const fill = rgba(val(["color"]));
  const line = rgba(val(["outline_color", "line_color"]));
  const width = parseFloat(val(["outline_width", "line_width"]) || "");
  const unit = val(["outline_width_unit", "line_width_unit"]) || "MM";
  const size = parseFloat(val(["size"]) || "");
  const layerOpacity = parseFloat((/<layerOpacity>([\d.]+)<\/layerOpacity>/.exec(xml) || [])[1] || "1");
  const px = (w) => (isNaN(w) ? null : Math.max(0.5, Math.round((unit === "Pixel" ? w : w * 3.78) * 10) / 10));
  return {
    fillColor: fill && fill.hex, fillOpacity: fill ? Math.round(fill.alpha * layerOpacity * 100) / 100 : null,
    lineColor: line && line.hex, lineWidth: px(width),
    circleRadius: isNaN(size) ? null : Math.max(2, Math.round(size * 3.78 / 2)),
  };
}
