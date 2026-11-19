// tour.js — map and tour editor: slides, camera, layers (points, line, QGIS, mapgl), display.
import { state, emit, markDirty, addMedia, addTextFile, mediaUrl } from "../state.js";
import { tget, tset, ORIG, findBlock, newSlide, newLayer } from "../model.js";
import { renderForm, h, sourcesField } from "../forms.js";
import { richText } from "../richtext.js";
import { BASEMAPS, FALLBACK_STYLE, addLayers, setVisible, rCode, setGeojsonCache, pointsGeojson } from "../maplayers.js";
import { lv95ToWgs84, wgs84ToLv95, parseNumber, toWgs84, simplify, geomKind, propertyNames, bbox, parseQml } from "../lib/geo.js";
import { esc, icon, fileToText, slugify, debounce, toast, ask } from "../lib/util.js";

let map = null, tab = "slide", clickMode = null;
const originals = new Map();   // layer id -> imported GeoJSON before simplification

export function renderTour(root) {
  const x = findBlock(state.story, state.tourBlockId);
  if (!x) { state.view = "write"; emit("view"); return; }
  const b = x.b, isTour = b.type === "tour";
  if (isTour && !b.slides.length) b.slides.push(newSlide(state.lang));
  if (isTour && !b.slides.find((s) => s.id === state.slideId)) state.slideId = b.slides[0].id;
  if (!isTour && tab === "slide") tab = "layers";
  const lang = state.lang, orig = ORIG(state.story);
  root.innerHTML = `
    <header class="sub-top">
      <button class="btn" id="back">${icon("back", 16)} Zurück zum Text</button>
      <div class="sub-title"><div class="muted small">Kapitel «${esc(tget(x.ch.nav, lang, orig))}» · Baustein</div>
        <b>${isTour ? "Tour (3D)" : "Karte"}</b></div>
      <button class="btn btn-primary" id="done">Fertig</button>
    </header>
    <div class="tour-body">
      ${isTour ? `<nav class="slides" aria-label="Folien"></nav>` : ""}
      <main class="tour-stage">
        <div class="stage-row">
          ${isTour ? `<div class="narr" style="flex-basis:${b.narrativeWidth || 36}%"></div>` : ""}
          <div class="map-wrap"><div id="tmap" class="tmap" aria-label="Kartenvorschau"></div>
            <div class="map-over"><span class="readout" id="readout"></span>
              <button class="btn btn-primary btn-small" id="capture">Aktuelle Ansicht ${isTour ? "für diese Folie " : ""}übernehmen</button></div>
            <div class="map-hint" id="hint" hidden></div></div>
        </div>
        <p class="muted small">Karte verschieben, mit rechter Maustaste drehen und neigen; dann die Ansicht übernehmen. 3D-Gelände erscheint in der Vorschau-Seite und auf der veröffentlichten Seite.</p>
      </main>
      <aside class="inspector tour-insp">
        <div class="tablist" role="tablist">
          ${isTour ? `<button role="tab" data-tab="slide" aria-selected="${tab === "slide"}">Folie</button>` : ""}
          <button role="tab" data-tab="layers" aria-selected="${tab === "layers"}">Ebenen</button>
          <button role="tab" data-tab="display" aria-selected="${tab === "display"}">Darstellung</button>
        </div>
        <div id="tabpanel"></div>
      </aside>
    </div>`;
  root.querySelector("#back").onclick = root.querySelector("#done").onclick = () => { destroyMap(); state.view = "write"; state.blockId = b.id; emit("view"); };
  root.querySelector(".tablist").onclick = (e) => { const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; renderTour(root); } };
  if (isTour) renderSlides(root.querySelector(".slides"), b, root);
  if (isTour) renderNarr(root.querySelector(".narr"), b);
  initMap(b);
  root.querySelector("#capture").onclick = () => captureView(b);
  const panel = root.querySelector("#tabpanel");
  if (tab === "slide" && isTour) renderSlideTab(panel, b, root);
  else if (tab === "layers") renderLayersTab(panel, b, root);
  else renderDisplayTab(panel, b, root);
}

const slideOf = (b) => b.slides && b.slides.find((s) => s.id === state.slideId);

// ------------------------------------------------------------ slides list
function renderSlides(el, b, root) {
  const orig = ORIG(state.story);
  el.innerHTML = `<div class="side-h">Folien</div>` + b.slides.map((s, i) => `
    <div class="slide-card${s.id === state.slideId ? " is-on" : ""}" data-s="${s.id}" tabindex="0" role="button" aria-pressed="${s.id === state.slideId}">
      <b>${i + 1} · ${esc(tget(s.title, state.lang, s.origLang || orig) || tget(s.title, s.origLang || orig, true) || "Ohne Titel")}</b>
      <small class="muted">${(s.images || []).length} Bild(er) · ${(s.show || []).length} Ebene(n)</small>
      <span class="slide-tools">
        <button data-act="up" aria-label="Nach oben" ${i === 0 ? "disabled" : ""}>${icon("up", 12)}</button>
        <button data-act="down" aria-label="Nach unten" ${i === b.slides.length - 1 ? "disabled" : ""}>${icon("down", 12)}</button>
        <button data-act="del" aria-label="Folie löschen">${icon("trash", 12)}</button></span>
    </div>`).join("") + `<button class="side-add" id="add-slide">+ Folie hinzufügen</button>`;
  el.onclick = (e) => {
    const c = e.target.closest("[data-s]");
    if (e.target.id === "add-slide") {
      const s = newSlide(state.lang);
      const cur = slideOf(b);
      if (cur) { s.view = { ...viewNow() }; s.show = [...(cur.show || [])]; }
      b.slides.push(s); state.slideId = s.id; markDirty(); renderTour(root); return;
    }
    if (!c) return;
    const i = b.slides.findIndex((s) => s.id === c.dataset.s);
    const act = e.target.closest("[data-act]");
    if (act) {
      const a = act.dataset.act;
      if (a === "del") {
        if (b.slides.length > 1) ask("Folie löschen?", { ok: "Löschen", danger: true }).then((y) => {
          if (y) { b.slides.splice(i, 1); state.slideId = b.slides[0].id; markDirty(); renderTour(root); } });
        return;
      }
      const j = a === "up" ? i - 1 : i + 1; [b.slides[i], b.slides[j]] = [b.slides[j], b.slides[i]];
      markDirty(); renderTour(root); return;
    }
    state.slideId = c.dataset.s; renderTour(root);
  };
}

function renderNarr(el, b) {
  const s = slideOf(b); if (!s) return;
  const orig = s.origLang || ORIG(state.story);
  el.innerHTML = `<div class="narr-card"><h3>${esc(tget(s.title, state.lang, orig) || "Folientitel")}</h3>
    <div class="narr-text">${(tget(s.html, state.lang, orig) || "").replace(/<cite[^>]*><\/cite>/g, "[Quelle]")}</div>
    <div class="narr-imgs">${(s.images || []).map((im) => `<figure><img alt="" data-src="${esc(im.src)}"><figcaption>${esc(tget(im.caption, state.lang, orig))}</figcaption></figure>`).join("")}</div></div>`;
  el.querySelectorAll("img[data-src]").forEach(async (img) => (img.src = await mediaUrl(img.dataset.src)));
}

// ------------------------------------------------------------ map
function destroyMap() { if (map) { map.remove(); map = null; } }

function initMap(b) {
  destroyMap();
  if (!window.maplibregl) { document.getElementById("tmap").innerHTML = "<p class='muted'>Kartenbibliothek nicht geladen.</p>"; return; }
  const s = slideOf(b);
  const v = (s ? s.view : b.view) || { center: [8.23, 46.8], zoom: 7 };
  const opts = { container: "tmap", style: BASEMAPS[b.basemap] || BASEMAPS.light, maxPitch: 85, attributionControl: { compact: true } };
  if (v.bounds) { opts.center = [(v.bounds[0] + v.bounds[2]) / 2, (v.bounds[1] + v.bounds[3]) / 2]; opts.zoom = 9; }
  else { opts.center = v.center; opts.zoom = v.zoom; }
  opts.pitch = v.pitch || 0; opts.bearing = v.bearing || 0;
  let styleFailed = false;
  map = new maplibregl.Map(opts);
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");
  map.on("error", (e) => {
    if (!styleFailed && !map.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(String(e.error && e.error.message))) {
      styleFailed = true; map.setStyle(FALLBACK_STYLE);
    }
  });
  const ready = async () => {
    const vis = s ? s.show : null;
    await addLayers(map, b.layers, { lang: state.lang, orig: ORIG(state.story), visible: vis && vis.length ? vis : null });
  };
  map.on("style.load", ready);
  map.on("move", () => showReadout());
  map.on("load", () => {
    if (v.bounds) map.fitBounds([[v.bounds[0], v.bounds[1]], [v.bounds[2], v.bounds[3]]], { padding: 40, bearing: v.bearing || 0, pitch: v.pitch || 0, duration: 0 });
    showReadout();
  });
  map.on("click", (e) => onMapClick(e, b));
}
function viewNow() {
  const c = map.getCenter();
  return { center: [+c.lng.toFixed(6), +c.lat.toFixed(6)], zoom: +map.getZoom().toFixed(2), pitch: Math.round(map.getPitch()), bearing: Math.round(map.getBearing()) };
}
function showReadout() {
  const r = document.getElementById("readout"); if (!r || !map) return;
  const v = viewNow();
  r.textContent = `Zoom ${v.zoom.toFixed(1).replace(".", ",")} · Neigung ${v.pitch}° · Drehung ${v.bearing}°`;
}
function captureView(b) {
  if (!map) return;
  const s = slideOf(b);
  if (s) s.view = viewNow(); else b.view = viewNow();
  markDirty(); toast("Ansicht übernommen.", "ok", 2000);
}
function refreshLayers(b) {
  if (!map || !map.isStyleLoaded()) return;
  for (const l of map.getStyle().layers.filter((x) => x.id.startsWith("L-"))) map.removeLayer(l.id);
  for (const id of Object.keys(map.getStyle().sources).filter((x) => x.startsWith("L-"))) map.removeSource(id);
  const s = slideOf(b);
  addLayers(map, b.layers, { lang: state.lang, orig: ORIG(state.story), visible: s && s.show && s.show.length ? s.show : null });
}
const refreshLayersSoon = debounce(refreshLayers, 300);

function onMapClick(e, b) {
  if (!clickMode) return;
  const l = b.layers.find((x) => x.id === clickMode.layer);
  const ll = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)];
  if (clickMode.kind === "point" && l) {
    l.points.push({ label: { [state.lang]: "Neuer Punkt" }, lon: ll[0], lat: ll[1], color: "#FC3B36", popup: { [state.lang]: "" } });
    clickMode = null;
  } else if (clickMode.kind === "line" && l) l.coords.push(ll);
  markDirty(); refreshLayers(b);
  const root = document.querySelector(".view");
  renderLayersTab(document.getElementById("tabpanel"), b, root);
}
function setHint(text) { const hEl = document.getElementById("hint"); if (hEl) { hEl.hidden = !text; hEl.textContent = text || ""; } }

// ------------------------------------------------------------ tab: slide
function renderSlideTab(el, b, root) {
  const s = slideOf(b); el.innerHTML = "";
  const orig = s.origLang || ORIG(state.story);
  const lang = state.lang;
  const title = h("input", { value: tget(s.title, lang), placeholder: tget(s.title, orig), lang, "aria-label": "Folientitel" });
  title.addEventListener("input", () => { tset(s.title, lang, title.value, orig); markDirty(); renderNarrSoon(b); });
  const text = richText({ html: tget(s.html, lang) || "<p></p>", lang, className: "rt-small", placeholder: "Text der Folie … (@ für eine Quelle)",
    onChange: (v) => { tset(s.html, lang, v, orig); markDirty(); renderNarrSoon(b); } });
  el.append(h("label", { class: "f" }, h("span", { class: "f-label" }, "Titel"), title), h("div", { class: "f" }, h("span", { class: "f-label" }, "Text"), text));
  const origSel = h("select", { "aria-label": "Originalsprache der Folie" }, ...state.story.settings.languages.map((l) => h("option", { value: l.code }, l.label)));
  origSel.value = orig;
  origSel.addEventListener("change", () => { s.origLang = origSel.value === ORIG(state.story) ? undefined : origSel.value; markDirty(); });
  el.append(h("label", { class: "f f-inline" }, h("span", { class: "f-label" }, "Originalsprache dieser Folie"), origSel));

  // images
  const imgs = h("div", { class: "f" }, h("span", { class: "f-label" }, "Bilder unter dem Text (anklicken vergrössert)"));
  (s.images || []).forEach((im, i) => {
    const box = h("details", { class: "img-item" }, h("summary", {}, `Bild ${i + 1}: ${im.src.split("/").pop() || "–"}`));
    box.appendChild(renderForm(im, [
      { key: "src", label: "Datei", type: "media", accept: "image/*" },
      { key: "alt", label: "Alt-Text", type: "i18n", required: true },
      { key: "caption", label: "Bildunterschrift", type: "i18n" },
      { key: "credit", label: "Bildnachweis", type: "credit" }], { onChange: () => renderNarrSoon(b) }));
    box.appendChild(h("button", { class: "btn btn-small btn-danger", onclick: () => { s.images.splice(i, 1); markDirty(); renderTour(root); } }, "Bild entfernen"));
    imgs.appendChild(box);
  });
  const add = h("input", { type: "file", accept: "image/*", class: "visually-hidden", id: "slide-img" });
  add.addEventListener("change", async () => {
    const p = await addMedia(add.files[0]);
    s.images = s.images || [];
    s.images.push({ id: "img" + Math.random().toString(36).slice(2, 7), src: p, alt: { [lang]: "" }, caption: { [lang]: "" }, credit: { author: "", year: "" } });
    markDirty(); renderTour(root);
  });
  imgs.append(h("label", { class: "btn btn-small", for: "slide-img" }, "+ Bild"), add);
  el.appendChild(imgs);

  // visible layers
  const vis = h("div", { class: "f" }, h("span", { class: "f-label" }, "Auf dieser Folie sichtbar"));
  s.show = s.show || [];
  for (const l of b.layers) {
    const cb = h("input", { type: "checkbox" }); cb.checked = s.show.includes(l.id);
    cb.addEventListener("change", () => {
      s.show = cb.checked ? [...new Set([...s.show, l.id])] : s.show.filter((x) => x !== l.id);
      markDirty(); if (map) setVisible(map, b.layers, s.show.length ? s.show : null);
    });
    vis.appendChild(h("label", { class: "check" }, cb, " " + (tget(l.name, lang, ORIG(state.story)) || l.type)));
  }
  if (!b.layers.length) vis.appendChild(h("p", { class: "f-help" }, "Noch keine Ebenen – im Reiter «Ebenen» hinzufügen."));
  el.appendChild(vis);
  const v = s.view || {};
  el.appendChild(h("p", { class: "f-help" }, v.bounds ? "Ansicht: Ausschnitt (aus früherer Einstellung)." : `Ansicht: ${v.center ? v.center.join(", ") : "–"} · Zoom ${v.zoom ?? "–"} · Neigung ${v.pitch ?? 0}° · Drehung ${v.bearing ?? 0}°`));
}
const renderNarrSoon = debounce((b) => { const n = document.querySelector(".narr"); if (n) renderNarr(n, b); }, 300);

// ------------------------------------------------------------ tab: layers
function renderLayersTab(el, b, root) {
  el.innerHTML = "";
  const orig = ORIG(state.story);
  if (!b.layers.find((l) => l.id === state.layerId)) state.layerId = b.layers[0] && b.layers[0].id;
  const list = h("div", { class: "layer-list" });
  b.layers.forEach((l, i) => {
    const row = h("button", { class: "layer-row" + (l.id === state.layerId ? " is-on" : ""), type: "button" },
      h("span", { class: "layer-type" }, { points: "Punkte", line: "Linie", geojson: "QGIS", mapgl: "mapgl" }[l.type]),
      tget(l.name, state.lang, orig) || l.id);
    row.addEventListener("click", () => { state.layerId = l.id; renderLayersTab(el, b, root); });
    list.appendChild(row);
  });
  const addRow = h("div", { class: "f-row f-wrap" },
    ...[["points", "+ Punkte"], ["line", "+ Linie"], ["geojson", "+ Ebene aus QGIS"], ["mapgl", "+ mapgl-Ebene"]].map(([t, l]) =>
      h("button", { class: "btn btn-small", type: "button", onclick: () => {
        const nl = newLayer(t, state.lang); b.layers.push(nl); state.layerId = nl.id;
        const s = slideOf(b); if (s) s.show = [...new Set([...(s.show || []), nl.id])];
        markDirty(); refreshLayers(b); renderLayersTab(el, b, root);
      } }, l)));
  el.append(h("div", { class: "f" }, h("span", { class: "f-label" }, "Ebenen (Reihenfolge = Zeichenreihenfolge)"), list), addRow);
  const l = b.layers.find((x) => x.id === state.layerId);
  if (!l) return;
  const i = b.layers.indexOf(l);
  el.appendChild(h("div", { class: "f-row layer-tools" },
    h("button", { class: "btn btn-small", disabled: i === 0, onclick: () => { [b.layers[i - 1], b.layers[i]] = [b.layers[i], b.layers[i - 1]]; markDirty(); refreshLayers(b); renderLayersTab(el, b, root); } }, "nach unten zeichnen"),
    h("button", { class: "btn btn-small btn-danger", onclick: async () => {
      if (!(await ask("Ebene entfernen?", { ok: "Entfernen", danger: true }))) return;
      b.layers.splice(i, 1); (b.slides || []).forEach((s) => (s.show = (s.show || []).filter((x) => x !== l.id)));
      markDirty(); refreshLayers(b); renderLayersTab(el, b, root);
    } }, "Ebene entfernen")));
  const changed = (k, rerender) => { refreshLayersSoon(b); if (rerender) renderLayersTab(el, b, root); };
  if (l.type === "points") el.appendChild(pointsEditor(l, b, el, root));
  if (l.type === "line") el.appendChild(lineEditor(l, b, el, root));
  if (l.type === "geojson") el.appendChild(qgisEditor(l, b, el, root));
  if (l.type === "mapgl") el.appendChild(mapglEditor(l, b, el, root, changed));
}

function pointsEditor(l, b, el, root) {
  const box = h("div", {});
  const changed = (k, rr) => { refreshLayersSoon(b); if (rr) renderLayersTab(el, b, root); };
  box.appendChild(renderForm(l, [
    { key: "name", label: "Name in der Legende", type: "i18n" },
    { key: "radius", label: "Grösse", type: "range", min: 4, max: 16 },
    { key: "labels", label: "Beschriftung auf der Karte", type: "toggle" }], { onChange: changed }));
  l.points.forEach((p, i) => {
    const sys = p._sys || "lv95";
    const [E, N] = wgs84ToLv95(p.lon, p.lat);
    const d = h("details", { class: "img-item", open: i === l.points.length - 1 }, h("summary", {}, tget(p.label, state.lang, ORIG(state.story)) || `Punkt ${i + 1}`));
    d.appendChild(renderForm(p, [
      { key: "label", label: "Beschriftung", type: "i18n" },
      { key: "popup", label: "Text im Popup", type: "i18n" },
      { key: "color", label: "Farbe", type: "color" }], { onChange: changed }));
    const seg = h("div", { class: "seg" }, ...[["lv95", "LV95"], ["wgs84", "WGS84"]].map(([v, t]) =>
      h("button", { type: "button", class: sys === v ? "is-on" : "", onclick: () => { p._sys = v; renderLayersTab(el, b, root); } }, t)));
    const a = h("input", { value: sys === "lv95" ? fmtCH(E) : p.lon, "aria-label": sys === "lv95" ? "E (Ost)" : "Länge" });
    const c = h("input", { value: sys === "lv95" ? fmtCH(N) : p.lat, "aria-label": sys === "lv95" ? "N (Nord)" : "Breite" });
    const out = h("p", { class: "f-help ok" }, `WGS84: ${p.lon.toFixed(6)} / ${p.lat.toFixed(6)}`);
    const upd = () => {
      const x = parseNumber(a.value), y = parseNumber(c.value);
      if (!isFinite(x) || !isFinite(y)) return;
      const [lon, lat] = sys === "lv95" ? lv95ToWgs84(x, y) : [x, y];
      p.lon = +lon.toFixed(6); p.lat = +lat.toFixed(6);
      out.textContent = `✓ umgerechnet: ${p.lon.toFixed(6)} / ${p.lat.toFixed(6)}`;
      markDirty(); refreshLayersSoon(b);
    };
    a.addEventListener("input", upd); c.addEventListener("input", upd);
    d.append(h("div", { class: "f" }, h("span", { class: "f-label" }, "Koordinaten"), seg,
      h("div", { class: "f-row" }, h("label", { class: "f-sub" }, sys === "lv95" ? "E (Ost)" : "Länge", a), h("label", { class: "f-sub" }, sys === "lv95" ? "N (Nord)" : "Breite", c)), out),
      h("button", { class: "btn btn-small btn-danger", onclick: () => { l.points.splice(i, 1); markDirty(); refreshLayers(b); renderLayersTab(el, b, root); } }, "Punkt entfernen"));
    box.appendChild(d);
  });
  box.appendChild(h("div", { class: "f-row f-wrap" },
    h("button", { class: "btn btn-small", onclick: () => {
      const c = map ? map.getCenter() : { lng: 8.23, lat: 46.8 };
      l.points.push({ label: { [state.lang]: "Neuer Punkt" }, lon: +c.lng.toFixed(6), lat: +c.lat.toFixed(6), color: "#FC3B36", popup: { [state.lang]: "" } });
      markDirty(); refreshLayers(b); renderLayersTab(el, b, root);
    } }, "+ Punkt (Kartenmitte)"),
    h("button", { class: "btn btn-small", onclick: () => { clickMode = { kind: "point", layer: l.id }; setHint("Auf die Karte klicken, um den Punkt zu setzen."); } }, "+ Punkt auf Karte klicken")));
  return box;
}
const fmtCH = (n) => (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");

function lineEditor(l, b, el, root) {
  const box = h("div", {});
  const changed = (k, rr) => { refreshLayersSoon(b); if (rr) renderLayersTab(el, b, root); };
  box.appendChild(renderForm(l, [
    { key: "name", label: "Name in der Legende", type: "i18n" },
    { key: "label", label: "Beschriftung entlang der Linie", type: "i18n" },
    { key: "color", label: "Farbe", type: "color" },
    { key: "width", label: "Breite", type: "range", min: 1, max: 10 },
    { key: "dashed", label: "Gestrichelt", type: "toggle" }], { onChange: changed }));
  const pts = [];
  for (const pl of b.layers.filter((x) => x.type === "points")) for (const p of pl.points) pts.push(p);
  const opts = pts.map((p, i) => h("option", { value: i }, tget(p.label, state.lang, ORIG(state.story)) || `Punkt ${i + 1}`));
  const from = h("select", { "aria-label": "Von Punkt" }, h("option", { value: "" }, "von …"), ...opts.map((o) => o.cloneNode(true)));
  const to = h("select", { "aria-label": "Zu Punkt" }, h("option", { value: "" }, "zu …"), ...opts);
  const mk = h("button", { class: "btn btn-small", onclick: () => {
    if (from.value === "" || to.value === "") return;
    const a = pts[+from.value], c = pts[+to.value];
    l.coords = [[a.lon, a.lat], [c.lon, c.lat]]; markDirty(); refreshLayers(b); renderLayersTab(el, b, root);
  } }, "Gerade Linie ziehen");
  box.append(h("div", { class: "f" }, h("span", { class: "f-label" }, `Verlauf (${l.coords.length} Punkte)`),
    pts.length ? h("div", { class: "f-row f-wrap" }, from, to, mk) : null,
    h("div", { class: "f-row f-wrap" },
      h("button", { class: "btn btn-small", onclick: () => { clickMode = { kind: "line", layer: l.id }; setHint("Auf die Karte klicken, um Punkte der Linie zu setzen. «Fertig zeichnen» beendet."); } }, "Auf Karte zeichnen"),
      h("button", { class: "btn btn-small", onclick: () => { clickMode = null; setHint(""); } }, "Fertig zeichnen"),
      h("button", { class: "btn btn-small btn-danger", onclick: () => { l.coords = []; markDirty(); refreshLayers(b); renderLayersTab(el, b, root); } }, "Leeren"))));
  return box;
}

// ------------------------------------------------------------ QGIS layer
function qgisEditor(l, b, el, root) {
  const box = h("div", {});
  const info = h("div", { class: "drop" + (l.file ? " drop-ok" : "") });
  info.innerHTML = l.file
    ? `<b>${esc(l.file.split("/").pop())}</b>${l._info ? `<br><span class="ok">${esc(l._info)}</span>` : ""}`
    : `<ol class="steps"><li>In QGIS: Rechtsklick auf die Ebene → <b>Exportieren → Objekte speichern als …</b> → Format <b>GeoJSON</b> (Koordinatensystem egal, LV95 wird erkannt)</li>
       <li>Optional für die Farben: <b>Eigenschaften → Symbolisierung → Stil → Stil speichern (QML)</b></li>
       <li>Beide Dateien hier wählen oder hineinziehen</li></ol>`;
  const inp = h("input", { type: "file", accept: ".geojson,.json,.qml,application/geo+json", multiple: true, class: "visually-hidden", id: "qgis-" + l.id });
  const handle = async (files) => {
    let msg = [];
    for (const f of files) {
      const text = await fileToText(f);
      if (/\.qml$/i.test(f.name)) {
        const st = parseQml(text);
        if (st.fillColor) l.fillColor = st.fillColor;
        if (st.fillOpacity != null) l.fillOpacity = st.fillOpacity;
        if (st.lineColor) l.lineColor = st.lineColor;
        if (st.lineWidth) l.lineWidth = st.lineWidth;
        if (st.circleRadius) l.circleRadius = st.circleRadius;
        if (st.fillColor && l.geom === "circle") l.circleColor = st.fillColor;
        msg.push(`Stil übernommen${st.fillColor ? `: Füllung ${st.fillColor}` : ""}${st.lineColor ? `, Rand ${st.lineColor}` : ""}`);
      } else {
        let gj;
        try { gj = JSON.parse(text); } catch (_) { toast("Die Datei ist kein gültiges GeoJSON.", "error"); continue; }
        const { geojson, crs } = toWgs84(gj);
        originals.set(l.id, geojson);
        const simp = simplify(geojson, l.simplify || 0);
        const path = `data/geo/${slugify(f.name.replace(/\.[^.]+$/, ""))}.geojson`;
        const out = JSON.stringify(simp);
        addTextFile(path, out); setGeojsonCache(path, simp);
        l.file = path; l.geom = geomKind(simp);
        const n = (simp.features || []).length;
        msg.unshift(`${n} Objekt(e) · ${crs === "EPSG:4326" ? "WGS84" : crs === "EPSG:2056" ? "LV95 (EPSG:2056) erkannt → nach WGS84 umgerechnet" : "LV03 erkannt → umgerechnet"} · ${(out.length / 1024).toFixed(1)} KB`);
        if (!tget(l.name, state.lang) || tget(l.name, state.lang) === "Ebene aus QGIS") l.name = { ...l.name, [state.lang]: f.name.replace(/\.[^.]+$/, "") };
        const bb = bbox(simp); if (bb && map) map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 40 });
      }
    }
    l._info = msg.join(" · ");
    markDirty(); refreshLayers(b); renderLayersTab(el, b, root);
  };
  inp.addEventListener("change", () => handle([...inp.files]));
  info.addEventListener("dragover", (e) => { e.preventDefault(); info.classList.add("drag"); });
  info.addEventListener("dragleave", () => info.classList.remove("drag"));
  info.addEventListener("drop", (e) => { e.preventDefault(); info.classList.remove("drag"); handle([...e.dataTransfer.files]); });
  box.append(info, h("label", { class: "btn btn-small", for: inp.id }, l.file ? "Andere Datei wählen" : "Dateien wählen"), inp);

  const orig = originals.get(l.id);
  const props = orig ? propertyNames(orig) : [];
  const schema = [
    { key: "name", label: "Name in der Legende", type: "i18n" },
    { key: "geom", label: "Darstellung", type: "seg", options: [["fill", "Fläche"], ["line", "Linie"], ["circle", "Punkte"]] },
    { key: "fillColor", label: "Füllfarbe", type: "color", show: (o) => o.geom === "fill" },
    { key: "fillOpacity", label: "Deckkraft der Füllung", type: "range", min: 0, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + " %", show: (o) => o.geom === "fill" },
    { key: "lineColor", label: "Rand/Linie", type: "color", show: (o) => o.geom !== "circle" },
    { key: "lineWidth", label: "Breite", type: "range", min: 0.5, max: 8, step: 0.5, show: (o) => o.geom !== "circle" },
    { key: "circleColor", label: "Punktfarbe", type: "color", show: (o) => o.geom === "circle" },
    { key: "circleRadius", label: "Punktgrösse", type: "range", min: 2, max: 14, show: (o) => o.geom === "circle" },
    { key: "labelField", label: "Beschriftung auf der Karte (Attribut)", type: props.length ? "select" : "text",
      options: [["", "– keine –"], ...props.map((p) => [p, p])], placeholder: "Attributname" },
    { key: "simplify", label: "Vereinfachen (kleinere Datei)", type: "range", min: 0, max: 0.001, step: 0.00005,
      format: (v) => (v ? `~${Math.round(v * 111000)} m` : "aus"), rerender: true, show: () => !!orig,
      help: "Wirkt beim nächsten Wählen der Datei bzw. sofort nach dem Loslassen." },
  ];
  box.appendChild(renderForm(l, schema, { onChange: (k, rr) => {
    if (k === "simplify" && orig && rr) {
      const simp = simplify(orig, l.simplify); const out = JSON.stringify(simp);
      addTextFile(l.file, out); setGeojsonCache(l.file, simp);
      l._info = `${(simp.features || []).length} Objekt(e) · ${Math.round(out.length / 1024)} KB nach Vereinfachung`;
    }
    refreshLayersSoon(b); if (rr) renderLayersTab(el, b, root);
  } }));
  // popup fields
  if (props.length) {
    const pf = h("div", { class: "f" }, h("span", { class: "f-label" }, "Im Popup anzeigen"));
    for (const p of props) {
      const cb = h("input", { type: "checkbox" }); cb.checked = (l.popupFields || []).includes(p);
      cb.addEventListener("change", () => { l.popupFields = cb.checked ? [...(l.popupFields || []), p] : l.popupFields.filter((x) => x !== p); markDirty(); });
      pf.appendChild(h("label", { class: "check chip" }, cb, " " + p));
    }
    box.appendChild(pf);
  } else if (l.popupFields && l.popupFields.length) box.appendChild(h("p", { class: "f-help" }, "Popup: " + l.popupFields.join(", ")));
  box.appendChild(sourcesField(l, { key: "sources", label: "Datenquelle (für Quellen und Nachweis)" }, () => markDirty()));
  return box;
}

// ------------------------------------------------------------ mapgl layer
function mapglEditor(l, b, el, root, changed) {
  const t = (o) => o.layerType;
  const vec = (o) => ["circle", "line", "fill", "fill-extrusion", "heatmap", "symbol"].includes(t(o));
  const schema = [
    { key: "name", label: "Name in der Legende", type: "i18n" },
    { key: "layerType", label: "Ebenentyp", type: "select", options: [["circle", "Kreise (circle)"], ["line", "Linien (line)"], ["fill", "Flächen (fill)"],
      ["fill-extrusion", "3D-Flächen (fill-extrusion)"], ["heatmap", "Heatmap"], ["symbol", "Beschriftung (symbol)"], ["raster", "Rasterkacheln (raster)"]] },
    { key: "source.kind", label: "Datenquelle", type: "seg", options: [["geojson", "GeoJSON"], ["vector", "Vektorkacheln"], ["raster", "Rasterkacheln"], ["geoadmin", "geo.admin.ch"]] },
    { key: "source.file", label: "GeoJSON-Datei im Repo", type: "media", accept: ".geojson,.json", dir: "data/geo", show: (o) => o.source.kind === "geojson" },
    { key: "source.url", label: "oder GeoJSON-Adresse (URL)", type: "url", show: (o) => o.source.kind === "geojson" },
    { key: "source.tiles", label: "Kachel-Adresse mit {z}/{x}/{y}", type: "url", placeholder: "https://…/{z}/{x}/{y}.pbf", show: (o) => o.source.kind === "vector" || o.source.kind === "raster" },
    { key: "source.sourceLayer", label: "source-layer", type: "text", show: (o) => o.source.kind === "vector" },
    { key: "source.geoadmin", label: "Ebene von map.geo.admin.ch (technischer Name)", type: "text", placeholder: "ch.bafu.wasser-teileinzugsgebiete_40", show: (o) => o.source.kind === "geoadmin",
      help: "Steht in der Adresse von map.geo.admin.ch hinter «layers=». Wird als Rasterkachel (WMTS) eingebunden." },
    { key: "paint.colorMode", label: "Farbe", type: "seg", options: [["single", "Einheitlich"], ["categories", "Nach Kategorie"], ["ramp", "Verlauf"]], show: (o) => vec(o) && !["heatmap", "symbol"].includes(t(o)) },
    { key: "paint.color", label: "Farbe", type: "color", show: (o) => t(o) !== "raster" && t(o) !== "heatmap" },
    { key: "paint.colorField", label: "Attribut für die Farbe", type: "text", show: (o) => o.paint.colorMode !== "single" && vec(o) },
    { key: "paint.colorStops", label: "Werte und Farben", type: "text", placeholder: "Laufwasser:#1B84CB, Speicher:#59BBA4  oder  0:#FFFFCC, 100:#253494",
      show: (o) => o.paint.colorMode !== "single" && vec(o) },
    { key: "paint.opacity", label: "Deckkraft", type: "range", min: 0, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + " %", show: (o) => t(o) !== "raster" && t(o) !== "symbol" },
    { key: "paint.radius", label: "Radius", type: "range", min: 1, max: 30, show: (o) => t(o) === "circle" },
    { key: "paint.strokeColor", label: "Rand", type: "color", show: (o) => t(o) === "circle" || t(o) === "fill" },
    { key: "paint.strokeWidth", label: "Randbreite", type: "range", min: 0, max: 6, step: 0.5, show: (o) => t(o) === "circle" },
    { key: "paint.width", label: "Linienbreite", type: "range", min: 0.5, max: 12, step: 0.5, show: (o) => t(o) === "line" },
    { key: "paint.heightField", label: "Höhe aus Attribut", type: "text", placeholder: "z. B. hoehe_m", show: (o) => t(o) === "fill-extrusion" },
    { key: "paint.height", label: "… oder feste Höhe (m)", type: "number", show: (o) => t(o) === "fill-extrusion" },
    { key: "paint.heatRadius", label: "Radius", type: "range", min: 2, max: 60, show: (o) => t(o) === "heatmap" },
    { key: "paint.heatIntensity", label: "Intensität", type: "range", min: 0.1, max: 5, step: 0.1, show: (o) => t(o) === "heatmap" },
    { key: "paint.textField", label: "Text aus Attribut", type: "text", show: (o) => t(o) === "symbol" },
    { key: "paint.textSize", label: "Schriftgrösse", type: "range", min: 8, max: 24, show: (o) => t(o) === "symbol" },
    { key: "paint.rasterOpacity", label: "Deckkraft", type: "range", min: 0, max: 1, step: 0.05, format: (v) => Math.round(v * 100) + " %", show: (o) => t(o) === "raster" },
    { key: "minzoom", label: "Sichtbar ab Zoom", type: "number", min: 0, max: 24 },
    { key: "maxzoom", label: "Sichtbar bis Zoom", type: "number", min: 0, max: 24 },
    { key: "filter", label: "Filter (MapLibre-Ausdruck, optional)", type: "text", placeholder: '["==", ["get", "typ"], "Speicher"]', show: vec },
  ];
  const box = h("div", {});
  box.appendChild(renderForm(l, schema, { onChange: (k, rr) => { changed(k, rr); updCode(); } }));
  const pf = h("input", { value: (l.popupFields || []).join(", "), placeholder: "Attribute, durch Komma getrennt", "aria-label": "Popup-Attribute" });
  pf.addEventListener("input", () => { l.popupFields = pf.value.split(",").map((s) => s.trim()).filter(Boolean); markDirty(); });
  box.appendChild(h("label", { class: "f" }, h("span", { class: "f-label" }, "Im Popup anzeigen"), pf));
  box.appendChild(sourcesField(l, { key: "sources", label: "Datenquelle (für Quellen und Nachweis)" }, () => markDirty()));
  const code = h("pre", { class: "code" });
  const updCode = () => (code.textContent = rCode(l));
  updCode();
  box.appendChild(h("details", { class: "f" }, h("summary", {}, "Erzeugter R-Code (mapgl)"), code));
  return box;
}

// ------------------------------------------------------------ tab: display
function renderDisplayTab(el, b, root) {
  el.innerHTML = "";
  const isTour = b.type === "tour";
  const schema = [
    { key: "basemap", label: "Hintergrundkarte", type: "seg", options: [["light", "swisstopo hell"], ["color", "swisstopo farbig"], ["aerial", "Luftbild"]] },
    { key: "terrain", label: "3D-Gelände (swisstopo)", type: "toggle" },
    { key: "exaggeration", label: "Überhöhung", type: "range", min: 1, max: 3, step: 0.1, format: (v) => String(v).replace(".", ",") + " ×", show: (o) => o.terrain },
    ...(isTour ? [
      { key: "narrativeWidth", label: "Breite der Textspalte", type: "range", min: 25, max: 60, step: 1, format: (v) => v + " %", rerender: true },
      { key: "panel", label: "Text", type: "seg", options: [["left", "links"], ["right", "rechts"]] },
    ] : [
      { key: "width", label: "Breite", type: "seg", options: [["standard", "Textbreite"], ["wide", "Breit"], ["full", "Ganze Breite"]] },
      { key: "height", label: "Höhe", type: "text", placeholder: "70vh" },
      { key: "scrollZoom", label: "Zoomen mit Mausrad", type: "toggle" },
      { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
      { key: "sources", label: "Quellen", type: "sources" },
    ]),
    { key: "legend", label: "Legende anzeigen", type: "toggle" },
  ];
  el.appendChild(renderForm(b, schema, { onChange: (k, rr) => {
    if (k === "basemap" && map) { map.setStyle(BASEMAPS[b.basemap]); }
    if (k === "narrativeWidth") { const n = document.querySelector(".narr"); if (n) n.style.flexBasis = b.narrativeWidth + "%"; if (map) map.resize(); return; }
    if (rr) renderDisplayTab(el, b, root);
  } }));
}
