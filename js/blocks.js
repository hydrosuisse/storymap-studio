// blocks.js — the building blocks: menu entries, settings schema, editor cards.
import { state, mediaUrl, markDirty, emit, readRepoText } from "./state.js";
import { tget, tset, ORIG, tableNumber, newLayer, BLOCK_LABEL } from "./model.js";
import { h, renderForm } from "./forms.js";
import { richText } from "./richtext.js";
import { esc, icon, stripTags } from "./lib/util.js";

export const MENU = [
  { type: "text", icon: "text", label: "Text", desc: "Absätze, Listen, Zitate" },
  { type: "subheading", icon: "heading", label: "Zwischentitel", desc: "Unterabschnitt im Kapitel" },
  { type: "abstract", icon: "abstract", label: "Zusammenfassung", desc: "Graue Box mit Titel" },
  { type: "image", icon: "image", label: "Bild", desc: "Foto oder Grafik mit Bildunterschrift" },
  { type: "table", icon: "table", label: "Tabelle", desc: "Nummeriert, mit Nachweis" },
  { type: "chart", icon: "chart", label: "Live-Grafik", desc: "BFE-Vorlage oder eigene Datenquelle" },
  { type: "embed", icon: "embed", label: "Einbettung", desc: "Dashboard oder Webseite" },
  { type: "video", icon: "video", label: "Video", desc: "Datei, YouTube, Vimeo, SWITCHtube" },
  { type: "map", icon: "map", label: "Karte", desc: "swisstopo-Karte mit Ebenen" },
  { type: "tour", icon: "tour", label: "Tour (3D)", desc: "Folien mit Text neben der Karte" },
  { type: "map", preset: "geojson", icon: "qgis", label: "Ebene aus QGIS", desc: "GeoJSON + QML-Stil, LV95 wird umgerechnet" },
  { type: "map", preset: "mapgl", icon: "layers", label: "mapgl-Ebene", desc: "Beliebiger mapgl-Ebenentyp" },
];

export const CHART_TEMPLATES = [
  ["speicherseen", "Füllstände der Speicherseen (BFE)"],
  ["produktion_handel", "Produktion, Verbrauch und Aussenhandel (BFE)"],
  ["produktion", "Produktion nach Energieträger (BFE)"],
  ["", "Eigene Datenquelle (API oder Datei)"],
];

const WIDTHS = [["standard", "Textbreite"], ["wide", "Breit"], ["full", "Ganze Breite"]];

export function presetBlock(b, preset) {
  if (preset) {
    b.layers.push(newLayer(preset, state.lang));
    b.basemap = "light";
  }
  return b;
}

// ------------------------------------------------------------ inspector schemas
export function schema(b) {
  switch (b.type) {
    case "text": return [{ type: "note", html: "Text direkt in der Mitte schreiben. <b>@</b> oder <b>\\cite{</b> tippen, um eine Quelle einzufügen. Formatierung über die Leiste oben." }];
    case "subheading": return [{ type: "note", label: "Den Zwischentitel direkt in der Mitte schreiben. Er erscheint nicht in der Navigation." }];
    case "abstract": return [
      { key: "titleSize", label: "Titelgrösse", type: "seg", options: [["small", "Kleine Überschrift"], ["h2", "Wie Kapiteltitel"]] },
      { type: "note", label: "Titel und Text direkt in der Box schreiben. Die Box erscheint nicht in der Navigation." }];
    case "image": return [
      { key: "src", label: "Bilddatei", type: "media", accept: "image/*", required: true, help: "PNG oder JPG. Wird für das Web verkleinert; PNG bleibt verlustfrei." },
      { key: "width", label: "Breite", type: "seg", options: WIDTHS },
      { key: "alt", label: "Alt-Text", type: "i18nArea", required: true, max: 150, rows: 2, help: "Beschreibt das Bild für Screenreader." },
      { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
      { key: "credit", label: "Bildnachweis", type: "credit" },
      { key: "sources", label: "Quellen (optional)", type: "sources" },
      { key: "zoom", label: "Zum Vergrössern anklicken", type: "toggle" }];
    case "table": return [
      { key: "title", label: "Titel (Nummer «Tabelle n» automatisch)", type: "i18n" },
      { type: "custom", render: tableTools },
      { key: "sources", label: "Datenquelle → Tabellennachweis", type: "sources" }];
    case "chart": {
      const custom = (o) => !o.template;
      return [
        { key: "template", label: "Grafik", type: "select", options: CHART_TEMPLATES },
        { key: "title", label: "Titel (für Screenreader und Link)", type: "i18n" },
        { type: "heading", label: "Eigene Datenquelle", show: custom },
        { key: "custom.url", label: "Adresse der Daten (CSV oder JSON) oder Datei im Repo", type: "text", placeholder: "https://… oder data/meine-daten.csv", show: custom },
        { key: "custom.secret", label: "Zugangsschlüssel: Name des GitHub-Secrets (falls nötig)", type: "text", placeholder: "z. B. ENTSOE_TOKEN", show: custom,
          help: "Den Schlüssel selbst nie hier eintragen: im Repository unter Settings → Secrets anlegen und im Link an seiner Stelle {SECRET} schreiben, z. B. …?securityToken={SECRET}. Im Workflow (.github/workflows) muss das Secret als env-Variable stehen." },
        { type: "custom", render: chartProbe, show: custom },
        { key: "custom.x", label: "Spalte für die Zeitachse", type: "text", placeholder: "z. B. unix_seconds oder datum", show: custom },
        { type: "custom", render: seriesEditor, show: custom },
        { key: "custom.kind", label: "Diagrammtyp", type: "seg", options: [["line", "Linie"], ["area", "Fläche gestapelt"], ["bar", "Balken"]], show: custom },
        { key: "custom.unit", label: "Einheit", type: "text", placeholder: "GWh", show: custom },
        { key: "custom.aggregate", label: "Zusammenfassen", type: "select", show: custom,
          options: [["none", "nicht zusammenfassen"], ["day", "pro Tag"], ["week", "pro Woche"], ["month", "pro Monat"]] },
        { key: "custom.aggFun", label: "Wie", type: "seg", options: [["sum", "Summe"], ["mean", "Mittelwert"]], show: (o) => custom(o) && o.custom.aggregate !== "none" },
        { key: "custom.rangeButtons", label: "Zeitraum-Knöpfe (1 Jahr · 5 Jahre · Gesamt)", type: "toggle", show: custom },
        { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
        { key: "sources", label: "Quellen", type: "sources" },
        { type: "note", label: "Die Grafik wird bei jedem Build neu erstellt (täglich um 06:17). Die letzte erfolgreiche Abfrage wird als Reserve gespeichert." }];
    }
    case "embed": return [
      { key: "url", label: "Adresse (URL)", type: "url", required: true, placeholder: "https://…" },
      { key: "title", label: "Titel (für Screenreader)", type: "i18n" },
      { key: "load", label: "Laden", type: "seg", options: [["lazy", "Beim Hinscrollen"], ["after_page", "2 s nach Seitenaufbau"]] },
      { key: "heightDesktop", label: "Höhe Desktop", type: "text", placeholder: "600px" },
      { key: "heightMobile", label: "Höhe Smartphone", type: "text", placeholder: "800px",
        help: "Tipp: die eingebettete Seite im Browser öffnen und ihre Höhe messen. Seiten, die ihre Höhe melden (wie die Grafikseiten), passen sich selbst an." },
      { key: "loadingText", label: "Ladehinweis", type: "i18n", placeholder: "Wird geladen …" },
      { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
      { key: "sourcePrefix", label: "Zeile beginnt mit", type: "seg", options: [["source", "Quelle:"], ["data", "Daten:"]] },
      { key: "sources", label: "Quellen", type: "sources" },
      { key: "openLink", label: "Link «In neuem Fenster öffnen»", type: "toggle" }];
    case "video": return [
      { key: "provider", label: "Videoquelle", type: "seg", options: [["file", "Datei"], ["youtube", "YouTube"], ["vimeo", "Vimeo"], ["switchtube", "SWITCHtube"]] },
      { key: "url", label: "Link zum Video", type: "url", placeholder: "https://www.youtube.com/watch?v=…", show: (o) => o.provider !== "file" },
      { key: "file", label: "Videodatei (MP4)", type: "media", accept: "video/mp4,video/webm", dir: "media/video", show: (o) => o.provider === "file",
        help: "GitHub speichert keine Dateien über 100 MB – längere Videos besser extern hosten." },
      { key: "poster", label: "Vorschaubild (optional)", type: "media", accept: "image/*" },
      { key: "width", label: "Breite", type: "seg", options: WIDTHS },
      { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
      { key: "alt", label: "Kurzbeschreibung (für Screenreader)", type: "i18n" },
      { key: "credit", label: "Video-Nachweis", type: "credit" },
      { type: "custom", render: subtitlesEditor, show: (o) => o.provider === "file" },
      { key: "autoplayLoop", label: "Kurzer Clip: stumm automatisch abspielen und wiederholen", type: "toggle", show: (o) => o.provider === "file" },
      { type: "note", label: "Externe Videos laden erst nach einem Klick (YouTube im Datenschutzmodus)." },
      { key: "sources", label: "Quellen (optional)", type: "sources" }];
    case "map": return [
      { type: "custom", render: (o) => h("button", { type: "button", class: "btn btn-primary btn-block", onclick: () => openMapEditor(o.id) }, "Karte und Ebenen bearbeiten") },
      { key: "basemap", label: "Hintergrundkarte", type: "seg", options: [["light", "swisstopo hell"], ["color", "swisstopo farbig"], ["aerial", "Luftbild"]] },
      { key: "width", label: "Breite", type: "seg", options: WIDTHS },
      { key: "height", label: "Höhe", type: "text", placeholder: "70vh" },
      { key: "terrain", label: "3D-Gelände (swisstopo)", type: "toggle" },
      { key: "legend", label: "Legende anzeigen", type: "toggle" },
      { key: "scrollZoom", label: "Zoomen mit Mausrad", type: "toggle" },
      { key: "caption", label: "Bildunterschrift", type: "i18nArea", rows: 2 },
      { key: "sources", label: "Quellen", type: "sources" }];
    case "tour": return [
      { type: "custom", render: (o) => h("button", { type: "button", class: "btn btn-primary btn-block", onclick: () => openMapEditor(o.id) }, "Tour-Editor öffnen") },
      { type: "custom", render: (o) => h("p", { class: "f-help" }, `${o.slides.length} Folie(n) · ${o.layers.length} Ebene(n) · ${o.terrain ? "3D-Gelände" : "flach"}`) }];
  }
  return [];
}

function openMapEditor(id) { state.tourBlockId = id; state.slideId = null; state.layerId = null; state.view = "tour"; emit("view"); }

// ------------------------------------------------------------ table tools
function tableTools(b, changed) {
  const n = b.header.length;
  const row = () => b.header.map(() => ({ [state.lang]: "" }));
  const btn = (txt, fn) => h("button", { type: "button", class: "btn btn-small", onclick: () => { fn(); changed("rows", true); } }, txt);
  const align = h("div", { class: "f" }, h("span", { class: "f-label" }, "Ausrichtung je Spalte"),
    h("div", { class: "f-row" }, ...b.header.map((hc, i) => {
      const s = h("select", { "aria-label": `Spalte ${i + 1}` }, h("option", { value: "left" }, "links"), h("option", { value: "right" }, "rechts"), h("option", { value: "center" }, "Mitte"));
      s.value = b.align[i] || "left";
      s.addEventListener("change", () => { b.align[i] = s.value; changed("align", true); });
      return s;
    })));
  const paste = h("textarea", { rows: 3, placeholder: "Aus Excel kopierte Zellen hier einfügen (ersetzt die Tabelle)", "aria-label": "Tabelle einfügen" });
  paste.addEventListener("change", () => {
    const lines = paste.value.trim().split(/\r?\n/).map((l) => l.split(/\t|;/));
    if (!lines.length || !lines[0].length) return;
    b.header = lines[0].map((c) => ({ [state.lang]: c.trim() }));
    b.rows = lines.slice(1).map((r) => b.header.map((_, i) => ({ [state.lang]: (r[i] || "").trim() })));
    b.align = b.header.map((_, i) => (b.rows.every((r) => /^[\d\s.,'’%–-]*$/.test(r[i][state.lang])) ? "right" : "left"));
    paste.value = ""; changed("rows", true);
  });
  return h("div", {},
    h("div", { class: "f-row f-wrap" },
      btn("+ Zeile", () => b.rows.push(row())),
      btn("− Zeile", () => b.rows.length > 1 && b.rows.pop()),
      btn("+ Spalte", () => { b.header.push({ [state.lang]: `Spalte ${n + 1}` }); b.rows.forEach((r) => r.push({ [state.lang]: "" })); b.align.push("left"); }),
      btn("− Spalte", () => { if (n > 1) { b.header.pop(); b.rows.forEach((r) => r.pop()); b.align.pop(); } })),
    align, h("div", { class: "f" }, h("span", { class: "f-label" }, "Aus Excel/CSV einfügen"), paste));
}

// ------------------------------------------------------------ custom chart: probe + series
function chartProbe(b) {
  const out = h("div", { class: "probe" });
  const go = h("button", { type: "button", class: "btn btn-small" }, "Testabfrage");
  go.addEventListener("click", async () => {
    out.textContent = "Frage Daten ab …";
    try {
      const url = b.custom.url;
      const text = /^https?:/.test(url) ? await (await fetch(url)).text() : await readRepoText(url);
      if (!text) throw new Error("leer");
      const cols = guessColumns(text);
      out.innerHTML = `<span class="ok">✓ ${cols.length} Spalten/Reihen gefunden:</span> ${cols.slice(0, 30).map((c) => `<code>${esc(c)}</code>`).join(" ")}`;
      if (!b.custom.x) { const xc = cols.find((c) => /unix|time|date|datum|zeit|^x$/i.test(c)); if (xc) b.custom.x = xc; }
      if (!b.custom.series.length) b.custom.series = cols.filter((c) => c !== b.custom.x).slice(0, 3).map((c, i) => ({ col: c, label: { [state.lang]: c }, color: PALETTE[i] }));
      markDirty(); emit("inspector");
    } catch (e) {
      out.innerHTML = `<span class="warn">Die Quelle lässt keine Abfrage aus dem Browser zu (oder ist nicht erreichbar). Der Build kann sie trotzdem abrufen – Spaltennamen dann bitte von Hand eintragen.</span>`;
    }
  });
  return h("div", { class: "f" }, go, out);
}
const PALETTE = ["#1B84CB", "#59BBA4", "#FCCC32", "#ED652E", "#C740B9", "#209F4A", "#EB9F46", "#333333"];
function guessColumns(text) {
  const t = text.trim();
  if (t[0] === "{" || t[0] === "[") {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return Object.keys(j[0] || {});
    const cols = [];
    for (const [k, v] of Object.entries(j)) {
      if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] && "name" in v[0]) v.forEach((s) => cols.push(s.name));
      else if (Array.isArray(v)) cols.push(k);
    }
    return cols;
  }
  const first = t.split(/\r?\n/)[0];
  return first.split(first.includes(";") ? ";" : ",").map((s) => s.replace(/^"|"$/g, "").trim());
}
function seriesEditor(b, changed) {
  const box = h("div", { class: "f" }, h("span", { class: "f-label" }, "Reihen (Spalte → Name in der Legende)"));
  const list = b.custom.series;
  list.forEach((s, i) => {
    const col = h("input", { value: s.col, "aria-label": "Spalte", class: "f-s" });
    const lab = h("input", { value: tget(s.label, state.lang), "aria-label": "Name in der Legende", placeholder: tget(s.label, ORIG(state.story)) });
    const color = h("input", { type: "color", value: s.color || PALETTE[i % 8], "aria-label": "Farbe" });
    const rm = h("button", { type: "button", class: "btn btn-small", "aria-label": "Reihe entfernen" }, "×");
    col.addEventListener("input", () => { s.col = col.value; changed("series"); });
    lab.addEventListener("input", () => { s.label = s.label || {}; tset(s.label, state.lang, lab.value, ORIG(state.story)); changed("series"); });
    color.addEventListener("input", () => { s.color = color.value; changed("series"); });
    rm.addEventListener("click", () => { list.splice(i, 1); changed("series", true); });
    box.appendChild(h("div", { class: "f-row series-row" }, color, col, lab, rm));
  });
  box.appendChild(h("button", { type: "button", class: "btn btn-small", onclick: () => { list.push({ col: "", label: { [state.lang]: "" }, color: PALETTE[list.length % 8] }); changed("series", true); } }, "+ Reihe"));
  return box;
}
function subtitlesEditor(b, changed) {
  const box = h("div", { class: "f" }, h("span", { class: "f-label" }, "Untertitel (.vtt) pro Sprache"));
  for (const l of state.story.settings.languages) {
    const has = b.subtitles && b.subtitles[l.code];
    const inp = h("input", { type: "file", accept: ".vtt,text/vtt", class: "visually-hidden", id: "vtt-" + b.id + l.code });
    inp.addEventListener("change", async () => {
      const { addMedia } = await import("./state.js");
      b.subtitles = b.subtitles || {};
      b.subtitles[l.code] = await addMedia(inp.files[0], "media/video");
      changed("subtitles", true);
    });
    box.appendChild(h("div", { class: "f-row" }, h("span", { class: "chip" + (has ? " chip-ok" : " chip-warn") }, `${l.code.toUpperCase()} ${has ? "✓" : "fehlt"}`),
      h("label", { class: "btn btn-small", for: inp.id }, has ? "Ersetzen" : "Datei wählen"), inp));
  }
  return box;
}

// ------------------------------------------------------------ editor cards (center column)
export function card(b, { lang, onChange }) {
  const orig = b.origLang || ORIG(state.story);
  const changed = () => { markDirty(); onChange && onChange(); };
  const ph = (o) => (lang !== orig ? stripTags(tget(o, orig)).slice(0, 120) : "");
  switch (b.type) {
    case "text": {
      return richText({ html: tget(b.html, lang) || "<p></p>", lang, placeholder: ph(b.html) || "Text schreiben … (@ für eine Quelle)",
        onChange: (v) => { tset(b.html, lang, v, orig); changed(); } });
    }
    case "subheading": {
      const i = h("input", { class: "sub-input", value: tget(b.text, lang), placeholder: ph(b.text) || "Zwischentitel", lang, "aria-label": "Zwischentitel" });
      i.addEventListener("input", () => { tset(b.text, lang, i.value, orig); changed(); });
      return i;
    }
    case "abstract": {
      const t = h("input", { class: "abs-title" + (b.titleSize === "h2" ? " is-h2" : ""), value: tget(b.title, lang), placeholder: ph(b.title) || "Zusammenfassung", lang, "aria-label": "Titel der Box" });
      t.addEventListener("input", () => { tset(b.title, lang, t.value, orig); changed(); });
      const r = richText({ html: tget(b.html, lang) || "<p></p>", lang, placeholder: ph(b.html) || "Zusammenfassung schreiben …",
        onChange: (v) => { tset(b.html, lang, v, orig); changed(); } });
      return h("div", { class: "abs-box" }, t, r);
    }
    case "image": {
      const img = h("img", { alt: tget(b.alt, lang, orig) });
      mediaUrl(b.src).then((u) => (img.src = u || ""));
      return h("figure", { class: "card-fig w-" + (b.width || "standard") },
        b.src ? img : h("div", { class: "img-empty" }, icon("image", 32), h("span", {}, "Bild wählen (rechts)")),
        h("figcaption", {}, tget(b.caption, lang, orig) || h("span", { class: "muted" }, "Bildunterschrift …"),
          b.credit && b.credit.author ? h("span", { class: "muted" }, ` · ${b.credit.author}${b.credit.year ? ", " + b.credit.year : ""}`) : null));
    }
    case "table": {
      const n = tableNumber(state.story, b.id);
      const cell = (c, tag, i) => {
        const el = h(tag, { contenteditable: "true", lang, style: { textAlign: b.align[i] || "left" } });
        el.textContent = tget(c, lang); el.dataset.ph = ph(c);
        el.addEventListener("input", () => { tset(c, lang, el.textContent, orig); changed(); });
        return el;
      };
      return h("figure", { class: "card-table" },
        h("figcaption", {}, h("b", {}, `Tabelle ${n}: `), tget(b.title, lang, orig) || h("span", { class: "muted" }, "Titel rechts eintragen")),
        h("table", {}, h("thead", {}, h("tr", {}, ...b.header.map((c, i) => cell(c, "th", i)))),
          h("tbody", {}, ...b.rows.map((r) => h("tr", {}, ...r.map((c, i) => cell(c, "td", i)))))),
        b.sources.length ? h("div", { class: "muted small" }, "Daten: " + b.sources.map((k) => state.citer ? state.citer.label(k, "t") : k).join("; ")) : null);
    }
    default: return summaryCard(b, lang, orig);
  }
}

function summaryCard(b, lang, orig) {
  const meta = MENU.find((m) => m.type === b.type && !m.preset);
  let title = tget(b.title, lang, orig) || tget(b.caption, lang, orig) || BLOCK_LABEL[b.type];
  let detail = "";
  if (b.type === "chart") detail = b.template ? (CHART_TEMPLATES.find((t) => t[0] === b.template) || [, ""])[1] : `Eigene Datenquelle: ${b.custom.url || "noch keine Adresse"}`;
  if (b.type === "embed") detail = b.url || "noch keine Adresse";
  if (b.type === "video") detail = b.provider === "file" ? (b.file || "noch keine Datei") : (b.url || "noch kein Link");
  if (b.type === "map") detail = `${b.layers.length} Ebene(n): ${b.layers.map((l) => tget(l.name, lang, orig)).join(", ") || "–"}`;
  if (b.type === "tour") { title = "Tour: " + (b.slides.map((s) => tget(s.title, lang, orig) || tget(s.title, s.origLang || orig, true)).filter(Boolean).join(" · ") || "ohne Folien"); detail = `${b.slides.length} Folie(n) · ${b.layers.length} Ebene(n)`; }
  const open = (b.type === "map" || b.type === "tour")
    ? h("button", { type: "button", class: "btn btn-small", onclick: (e) => { e.stopPropagation(); openMapEditor(b.id); } }, b.type === "tour" ? "Tour-Editor öffnen" : "Karte bearbeiten") : null;
  return h("div", { class: "sum-card" },
    h("span", { class: "sum-icon", html: icon(meta ? meta.icon : "embed", 20) }),
    h("div", { class: "sum-body" }, h("div", { class: "sum-title" }, title), h("div", { class: "muted small" }, detail)),
    open);
}

export { renderForm };
