// maplayers.js — the layer types of maps and tours: preview in MapLibre (studio)
// and the equivalent mapgl R code (shown to the user; the build generates the same).
import { readRepoText } from "./state.js";
import { tget } from "./model.js";

export const BASEMAPS = {
  light: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json",
  color: "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json",
  aerial: {
    version: 8,
    glyphs: "https://vectortiles.geo.admin.ch/fonts/{fontstack}/{range}.pbf",
    sources: { swissimage: { type: "raster", tileSize: 256, attribution: "© swisstopo",
      tiles: ["https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg"] } },
    layers: [{ id: "swissimage", type: "raster", source: "swissimage" }],
  },
};
export const FALLBACK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#E6ECE3" } }] };

export const geoadminTiles = (id) => `https://wmts.geo.admin.ch/1.0.0/${id}/default/current/3857/{z}/{x}/{y}.png`;

const fc = (features) => ({ type: "FeatureCollection", features });

// ------------------------------------------------------------ GeoJSON for simple layers
export function pointsGeojson(l, lang, orig) {
  return fc(l.points.filter((p) => isFinite(p.lon) && isFinite(p.lat)).map((p) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: { label: tget(p.label, lang, orig), popup: tget(p.popup, lang, orig), color: p.color || "#FC3B36" } })));
}
export function lineGeojson(l, lang, orig) {
  return fc(l.coords.length >= 2 ? [{ type: "Feature", geometry: { type: "LineString", coordinates: l.coords },
    properties: { label: tget(l.label, lang, orig) } }] : []);
}

const geoCache = new Map();
export async function loadGeojson(path) {
  if (!path) return fc([]);
  if (geoCache.has(path)) return geoCache.get(path);
  try {
    const text = /^https?:/.test(path) ? await (await fetch(path)).text() : await readRepoText(path);
    const gj = JSON.parse(text);
    geoCache.set(path, gj);
    return gj;
  } catch (_) { return fc([]); }
}
export const setGeojsonCache = (path, gj) => geoCache.set(path, gj);

// ------------------------------------------------------------ MapLibre preview
export async function addLayers(map, layers, { lang, orig, visible }) {
  const hasGlyphs = !!map.getStyle().glyphs;
  for (const l of layers) {
    const id = "L-" + l.id;
    const vis = !visible || visible.includes(l.id) ? "visible" : "none";
    const add = (spec) => { if (!map.getLayer(spec.id)) map.addLayer({ ...spec, layout: { ...(spec.layout || {}), visibility: vis } }); };
    try {
      if (l.type === "points") {
        map.addSource(id, { type: "geojson", data: pointsGeojson(l, lang, orig) });
        add({ id, type: "circle", source: id, paint: { "circle-color": ["get", "color"], "circle-radius": l.radius || 9,
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 3, "circle-pitch-alignment": "map" } });
        if (l.labels && hasGlyphs) add({ id: id + "-lbl", type: "symbol", source: id,
          layout: { "text-field": ["get", "label"], "text-font": ["Frutiger Neue Medium"], "text-size": 14, "text-anchor": "left", "text-offset": [1.2, 0], "text-allow-overlap": true },
          paint: { "text-color": "#1a1a1a", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
      } else if (l.type === "line") {
        map.addSource(id, { type: "geojson", data: lineGeojson(l, lang, orig) });
        add({ id, type: "line", source: id, paint: { "line-color": l.color, "line-width": l.width || 3, ...(l.dashed ? { "line-dasharray": [2, 1] } : {}) } });
        if (hasGlyphs && tget(l.label, lang, orig)) add({ id: id + "-lbl", type: "symbol", source: id,
          layout: { "text-field": ["get", "label"], "text-font": ["Frutiger Neue Medium"], "text-size": 13, "symbol-placement": "line-center", "text-offset": [0, -0.9] },
          paint: { "text-color": "#333333", "text-halo-color": "#ffffff", "text-halo-width": 2 } });
      } else if (l.type === "geojson") {
        map.addSource(id, { type: "geojson", data: await loadGeojson(l.file) });
        if (l.geom === "fill") {
          add({ id, type: "fill", source: id, paint: { "fill-color": l.fillColor, "fill-opacity": +l.fillOpacity } });
          add({ id: id + "-line", type: "line", source: id, paint: { "line-color": l.lineColor, "line-width": +l.lineWidth } });
        } else if (l.geom === "line") add({ id, type: "line", source: id, paint: { "line-color": l.lineColor, "line-width": +l.lineWidth } });
        else add({ id, type: "circle", source: id, paint: { "circle-color": l.circleColor, "circle-radius": +l.circleRadius, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
        if (l.labelField && hasGlyphs) add({ id: id + "-lbl", type: "symbol", source: id,
          layout: { "text-field": ["get", l.labelField], "text-font": ["Frutiger Neue Medium"], "text-size": 13 },
          paint: { "text-color": "#1a1a1a", "text-halo-color": "#fff", "text-halo-width": 2 } });
      } else if (l.type === "mapgl") {
        await addMapglLayer(map, l, id, add, hasGlyphs);
      }
    } catch (e) { console.warn("layer", l.id, e); }
  }
}

async function addMapglLayer(map, l, id, add, hasGlyphs) {
  const s = l.source, p = l.paint;
  if (s.kind === "geojson") map.addSource(id, { type: "geojson", data: s.url || (await loadGeojson(s.file)) });
  else if (s.kind === "vector") map.addSource(id, { type: "vector", tiles: [s.tiles] });
  else map.addSource(id, { type: "raster", tiles: [s.kind === "geoadmin" ? geoadminTiles(s.geoadmin) : s.tiles], tileSize: +s.tileSize || 256 });
  const base = { id, source: id, minzoom: +l.minzoom || 0, maxzoom: +l.maxzoom || 24 };
  if (s.kind === "vector") base["source-layer"] = s.sourceLayer;
  if (l.filter) { try { base.filter = JSON.parse(l.filter); } catch (_) {} }
  const color = colorExpr(l);
  switch (l.layerType) {
    case "circle": add({ ...base, type: "circle", paint: { "circle-color": color, "circle-radius": +p.radius, "circle-opacity": +p.opacity, "circle-stroke-color": p.strokeColor, "circle-stroke-width": +p.strokeWidth } }); break;
    case "line": add({ ...base, type: "line", paint: { "line-color": color, "line-width": +p.width, "line-opacity": +p.opacity } }); break;
    case "fill": add({ ...base, type: "fill", paint: { "fill-color": color, "fill-opacity": +p.opacity, "fill-outline-color": p.strokeColor } }); break;
    case "fill-extrusion": add({ ...base, type: "fill-extrusion", paint: { "fill-extrusion-color": color, "fill-extrusion-opacity": +p.opacity,
      "fill-extrusion-height": p.heightField ? ["to-number", ["get", p.heightField]] : +p.height } }); break;
    case "heatmap": add({ ...base, type: "heatmap", paint: { "heatmap-radius": +p.heatRadius, "heatmap-intensity": +p.heatIntensity, "heatmap-opacity": +p.opacity } }); break;
    case "symbol": if (hasGlyphs) add({ ...base, type: "symbol", layout: { "text-field": ["get", p.textField || "name"], "text-font": ["Frutiger Neue Medium"], "text-size": +p.textSize },
      paint: { "text-color": p.color, "text-halo-color": "#fff", "text-halo-width": 2 } }); break;
    case "raster": add({ ...base, type: "raster", paint: { "raster-opacity": +p.rasterOpacity } }); break;
  }
}

// colour: single, or by attribute (categories listed as "wert:#farbe, …" or a ramp "min:#a, max:#b")
function colorExpr(l) {
  const p = l.paint;
  if (p.colorMode === "single" || !p.colorField) return p.color;
  const pairs = String(p.colorStops || "").split(",").map((x) => x.split(":").map((y) => y.trim())).filter((x) => x.length === 2);
  if (!pairs.length) return p.color;
  if (p.colorMode === "ramp") return ["interpolate", ["linear"], ["to-number", ["get", p.colorField]], ...pairs.flatMap(([v, c]) => [+v, c])];
  return ["match", ["to-string", ["get", p.colorField]], ...pairs.flatMap(([v, c]) => [v, c]), p.color];
}

export function setVisible(map, layers, visible) {
  for (const l of layers) for (const suffix of ["", "-lbl", "-line"]) {
    const id = "L-" + l.id + suffix;
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", !visible || visible.includes(l.id) ? "visible" : "none");
  }
}

// ------------------------------------------------------------ R code (for the "show code" box)
const q = (s) => JSON.stringify(String(s ?? ""));
export function rCode(l) {
  const id = "L-" + l.id;
  if (l.type !== "mapgl") return "# wird beim Build automatisch erzeugt";
  const s = l.source, p = l.paint;
  const lines = ["map |>"];
  if (s.kind === "geojson") lines.push(`  add_source(id = ${q(id)}, data = ${s.url ? q(s.url) : `sf::st_read(${q(s.file)}, quiet = TRUE)`}) |>`);
  else if (s.kind === "vector") lines.push(`  add_vector_source(id = ${q(id)}, tiles = ${q(s.tiles)}) |>`);
  else lines.push(`  add_raster_source(id = ${q(id)}, tiles = ${q(s.kind === "geoadmin" ? geoadminTiles(s.geoadmin) : s.tiles)}, tileSize = ${+s.tileSize || 256}) |>`);
  const common = `id = ${q(id + "-layer")}, source = ${q(id)}${s.kind === "vector" ? `, source_layer = ${q(s.sourceLayer)}` : ""}, min_zoom = ${+l.minzoom || 0}, max_zoom = ${+l.maxzoom || 24}`;
  const col = p.colorMode === "single" || !p.colorField ? q(p.color) : `<Ausdruck nach ${p.colorField}>`;
  switch (l.layerType) {
    case "circle": lines.push(`  add_circle_layer(${common},\n    circle_color = ${col}, circle_radius = ${+p.radius}, circle_opacity = ${+p.opacity},\n    circle_stroke_color = ${q(p.strokeColor)}, circle_stroke_width = ${+p.strokeWidth})`); break;
    case "line": lines.push(`  add_line_layer(${common},\n    line_color = ${col}, line_width = ${+p.width}, line_opacity = ${+p.opacity})`); break;
    case "fill": lines.push(`  add_fill_layer(${common},\n    fill_color = ${col}, fill_opacity = ${+p.opacity}, fill_outline_color = ${q(p.strokeColor)})`); break;
    case "fill-extrusion": lines.push(`  add_fill_extrusion_layer(${common},\n    fill_extrusion_color = ${col}, fill_extrusion_opacity = ${+p.opacity},\n    fill_extrusion_height = ${p.heightField ? `get_column(${q(p.heightField)})` : +p.height})`); break;
    case "heatmap": lines.push(`  add_heatmap_layer(${common},\n    heatmap_radius = ${+p.heatRadius}, heatmap_intensity = ${+p.heatIntensity}, heatmap_opacity = ${+p.opacity})`); break;
    case "symbol": lines.push(`  add_symbol_layer(${common},\n    text_field = get_column(${q(p.textField || "name")}), text_size = ${+p.textSize}, text_color = ${q(p.color)})`); break;
    case "raster": lines.push(`  add_raster_layer(${common},\n    raster_opacity = ${+p.rasterOpacity})`); break;
  }
  return lines.join("\n");
}
