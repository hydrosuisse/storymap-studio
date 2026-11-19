// model.js — the story document (content/story.json) and helpers around it.
//
// Translatable values are objects { de: "...", fr: "...", _h: { fr: "<hash of the
// original when fr was last edited>" } }. A translation is "outdated" when the
// original text changed after the translation was written.
import { hash, uid, stripTags } from "./lib/util.js";

export const ORIG = (story) => story.settings.originalLanguage || story.settings.languages[0].code;
export const LANGS = (story) => story.settings.languages.map((l) => l.code);

export function tget(obj, lang, fallback) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  if (obj[lang] != null && obj[lang] !== "") return obj[lang];
  if (fallback) {
    if (obj[fallback]) return obj[fallback];
    for (const k of Object.keys(obj)) if (k !== "_h" && obj[k]) return obj[k];
  }
  return "";
}

// set a translatable value; when writing a non-original language, remember the
// hash of the original so later changes to it mark the translation as outdated
export function tset(obj, lang, value, orig) {
  obj[lang] = value;
  if (lang !== orig) {
    obj._h = obj._h || {};
    obj._h[lang] = hash(obj[orig] || "");
  }
  return obj;
}

export function tstatus(obj, lang, orig) {
  if (!obj || typeof obj !== "object") return "missing";
  if (lang === orig) return obj[orig] ? "ok" : "missing";
  if (!obj[lang] || !stripTags(obj[lang])) return obj[orig] ? "missing" : "ok";
  if (obj._h && obj._h[lang] === "_copy") return "missing";   // original copied as a starting point
  if (obj._h && obj._h[lang] && obj._h[lang] !== hash(obj[orig] || "")) return "outdated";
  return "ok";
}

export const T = (de = "", extra = {}) => ({ de, ...extra });

// ------------------------------------------------------------ block defaults
export function newBlock(type, lang = "de") {
  const id = uid(type.slice(0, 3));
  const t = (s = "") => ({ [lang]: s });
  switch (type) {
    case "text": return { id, type, html: t("<p></p>") };
    case "subheading": return { id, type, text: t("") };
    case "abstract": return { id, type, title: t(lang === "fr" ? "Résumé" : "Zusammenfassung"), titleSize: "h2", html: t("<p></p>") };
    case "image": return { id, type, src: "", width: "standard", zoom: true, alt: t(), caption: t(), credit: { author: "", year: "" }, sources: [] };
    case "table": return { id, type, title: t(), header: [t("Spalte 1"), t("Spalte 2")], rows: [[t(), t()], [t(), t()]], align: ["left", "left"], sources: [] };
    case "chart": return { id, type, template: "speicherseen", title: t(), caption: t(), sources: [],
      custom: { url: "", format: "auto", secret: "", x: "", series: [], kind: "line", unit: "", aggregate: "none", aggFun: "sum", rangeButtons: true } };
    case "embed": return { id, type, url: "", title: t(), load: "lazy", delay: 2000, heightDesktop: "600px", heightMobile: "800px", loadingText: t(), caption: t(), sources: [], openLink: true };
    case "video": return { id, type, provider: "youtube", url: "", file: "", poster: "", width: "wide", caption: t(), alt: t(), credit: { author: "", year: "" }, subtitles: {}, autoplayLoop: false, sources: [] };
    case "map": return { id, type, basemap: "light", terrain: false, exaggeration: 1.3, height: "70vh", width: "wide", legend: true, scrollZoom: false,
      view: { center: [8.23, 46.8], zoom: 7, pitch: 0, bearing: 0 }, layers: [], caption: t(), sources: [] };
    case "tour": return { id, type, basemap: "color", terrain: true, exaggeration: 1.3, narrativeWidth: 36, panel: "left", legend: true, layers: [],
      slides: [newSlide(lang)] };
    default: throw new Error("unknown block " + type);
  }
}
export function newSlide(lang = "de") {
  return { id: uid("s"), title: { [lang]: "" }, html: { [lang]: "<p></p>" }, images: [], view: { center: [8.23, 46.8], zoom: 7.5, pitch: 0, bearing: 0 }, show: [] };
}
export function newLayer(type, lang = "de") {
  const id = uid("l");
  const t = (s = "") => ({ [lang]: s });
  switch (type) {
    case "points": return { id, type, name: t("Punkte"), radius: 9, labels: true, points: [] };
    case "line": return { id, type, name: t("Linie"), coords: [], color: "#333333", width: 3, dashed: false, label: t("") };
    case "geojson": return { id, type, file: "", name: t("Ebene aus QGIS"), geom: "fill", fillColor: "#2E86C1", fillOpacity: 0.35,
      lineColor: "#1B4F72", lineWidth: 2, circleColor: "#1B84CB", circleRadius: 6, labelField: "", popupFields: [], simplify: 0, sources: [] };
    case "mapgl": return { id, type, name: t("mapgl-Ebene"), layerType: "circle",
      source: { kind: "geojson", file: "", url: "", tiles: "", sourceLayer: "", geoadmin: "", tileSize: 256 },
      paint: { color: "#1B84CB", opacity: 0.8, radius: 6, strokeColor: "#FFFFFF", strokeWidth: 1, width: 2, heightField: "", height: 100,
               colorField: "", colorMode: "single", textField: "", textSize: 13, heatRadius: 20, heatIntensity: 1, rasterOpacity: 0.7 },
      minzoom: 0, maxzoom: 24, filter: "", popupFields: [], sources: [] };
    default: throw new Error("unknown layer " + type);
  }
}

// ------------------------------------------------------------ iteration
// visit every block (including slides' images as pseudo items) with context
export function* allBlocks(story) {
  for (const [ci, ch] of story.chapters.entries())
    for (const [bi, b] of ch.blocks.entries()) yield { ch, ci, b, bi };
}

export function findBlock(story, id) {
  for (const x of allBlocks(story)) if (x.b.id === id) return x;
  return null;
}

// images (block images, slide images, cover) in reading order, for Bildnachweise
export function allImages(story) {
  const out = [];
  if (story.cover && story.cover.image) out.push({ id: "cover", kind: "cover", item: story.cover, where: "Titelbild" });
  for (const { ch, b } of allBlocks(story)) {
    if (b.type === "image") out.push({ id: b.id, kind: "image", item: b, where: tget(ch.nav, ORIG(story), true) });
    if (b.type === "video") out.push({ id: b.id, kind: "video", item: b, where: tget(ch.nav, ORIG(story), true) });
    if (b.type === "tour") for (const s of b.slides) for (const im of s.images || [])
      out.push({ id: im.id, kind: "slideimage", item: im, slide: s, block: b, where: tget(ch.nav, ORIG(story), true) + " · Tour" });
  }
  return out;
}
export function allTables(story) {
  const out = []; let n = 0;
  for (const { ch, b } of allBlocks(story)) if (b.type === "table") out.push({ id: b.id, n: ++n, item: b, where: tget(ch.nav, ORIG(story), true) });
  return out;
}
export function tableNumber(story, id) {
  const t = allTables(story).find((x) => x.id === id);
  return t ? t.n : 0;
}

// ------------------------------------------------------------ Nachweise
const isLicense = (a) => /\b(CC|Public Domain|gemeinfrei|domaine public)\b/i.test(a || "");

export function creditText(credit) {
  if (!credit) return "";
  const a = (credit.author || "").trim(), y = (credit.year || "").trim();
  if (!a) return "";
  if (isLicense(a) || !y) return a;
  return `${a} (${y})`;
}

export function suggestLabel(entry, lang, orig) {
  const it = entry.item;
  if (entry.kind === "cover") return tget(it.creditLabel, lang, orig) || "Titelbild";
  let cap = stripTags(tget(it.caption, lang, orig));
  cap = cap.replace(/\s*(Foto|Bild|Grafik|Photo|Image|Video)\s*:.*$/i, "").replace(/[.\s]+$/, "");
  if (!cap) cap = stripTags(tget(it.alt, lang, orig));
  if (entry.kind === "video") cap = (lang === "fr" ? "Vidéo : " : "Video: ") + cap;
  return cap;
}

export function nachweisRows(story, lang) {
  const orig = ORIG(story);
  const ov = (story.nachweise && story.nachweise.overrides) || {};
  const rows = [];
  for (const e of allImages(story)) {
    const o = ov[e.id] || {};
    const sugLabel = suggestLabel(e, lang, orig);
    const sugCredit = creditText(e.item.credit);
    const label = o.label ? tget(o.label, lang, orig) : sugLabel;
    const credit = o.credit != null && o.credit !== "" ? o.credit : sugCredit;
    const a = (e.item.credit && e.item.credit.author) || "";
    const y = (e.item.credit && e.item.credit.year) || "";
    let status = (o.label || (o.credit != null && o.credit !== "")) ? "custom" : "suggested";
    let missing = "";
    if (!a && !(o.credit)) missing = "Urheber/in fehlt";
    else if (a && !y && !isLicense(a) && !(o.credit)) missing = "Jahr fehlt";
    if (missing) status = "missing";
    rows.push({ id: e.id, entry: e, label, credit, sugLabel, sugCredit, status, missing, merge: !!o.mergeWithPrevious });
  }
  // merge rows marked "mergeWithPrevious"
  const merged = [];
  for (const r of rows) {
    if (r.merge && merged.length) { merged[merged.length - 1].mergedIds.push(r.id); continue; }
    merged.push({ ...r, mergedIds: [] });
  }
  return merged;
}

// ------------------------------------------------------------ translations
// every translatable value in reading order: [{obj, label, kind, origLang, ref}]
export function translatables(story) {
  const out = [];
  const orig = ORIG(story);
  const add = (obj, label, kind = "text", origLang = orig, ref = null) => { if (obj && typeof obj === "object") out.push({ obj, label, kind, origLang, ref }); };
  const c = story.cover;
  add(c.title, "Titelbild · Titel"); add(c.subtitle, "Titelbild · Untertitel"); add(c.alt, "Titelbild · Alt-Text"); add(c.creditLabel, "Titelbild · Bildnachweis");
  for (const ch of story.chapters) {
    const where = tget(ch.nav, orig, true);
    add(ch.nav, `Kapitel «${where}» · Navigation`, "text", orig, { ch: ch.id });
    add(ch.title, `Kapitel «${where}» · Titel`, "text", orig, { ch: ch.id });
    for (const b of ch.blocks) {
      const o = b.origLang || orig, ref = { ch: ch.id, block: b.id };
      const lbl = (f) => `Kapitel «${where}» · ${BLOCK_LABEL[b.type] || b.type}${f ? " · " + f : ""}`;
      switch (b.type) {
        case "text": add(b.html, lbl(), "html", o, ref); break;
        case "subheading": add(b.text, lbl(), "text", o, ref); break;
        case "abstract": add(b.title, lbl("Titel"), "text", o, ref); add(b.html, lbl("Text"), "html", o, ref); break;
        case "image": add(b.caption, lbl("Bildunterschrift"), "text", o, ref); add(b.alt, lbl("Alt-Text"), "text", o, ref); break;
        case "video": add(b.caption, lbl("Bildunterschrift"), "text", o, ref); add(b.alt, lbl("Beschreibung"), "text", o, ref); break;
        case "table":
          add(b.title, lbl("Titel"), "text", o, ref);
          b.header.forEach((hc, i) => add(hc, lbl(`Kopfzeile ${i + 1}`), "text", o, ref));
          b.rows.forEach((r, ri) => r.forEach((cell, i) => { if (/[A-Za-zÀ-ÿ]{2,}/.test(tget(cell, o))) add(cell, lbl(`Zeile ${ri + 1}, Spalte ${i + 1}`), "text", o, ref); }));
          break;
        case "chart": add(b.title, lbl("Titel"), "text", o, ref); add(b.caption, lbl("Bildunterschrift"), "text", o, ref);
          for (const s of (b.custom && b.custom.series) || []) add(s.label, lbl("Reihe"), "text", o, ref); break;
        case "embed": add(b.title, lbl("Titel"), "text", o, ref); add(b.caption, lbl("Bildunterschrift"), "text", o, ref); add(b.loadingText, lbl("Ladehinweis"), "text", o, ref); break;
        case "map": add(b.caption, lbl("Bildunterschrift"), "text", o, ref); layerTr(b.layers, lbl, o, ref, add); break;
        case "tour":
          layerTr(b.layers, lbl, o, ref, add);
          b.slides.forEach((s, si) => {
            const so = s.origLang || o, sref = { ...ref, slide: s.id };
            add(s.title, lbl(`Folie ${si + 1} · Titel`), "text", so, sref);
            add(s.html, lbl(`Folie ${si + 1} · Text`), "html", so, sref);
            (s.images || []).forEach((im, ii) => {
              add(im.caption, lbl(`Folie ${si + 1} · Bild ${ii + 1} · Bildunterschrift`), "text", so, sref);
              add(im.alt, lbl(`Folie ${si + 1} · Bild ${ii + 1} · Alt-Text`), "text", so, sref);
            });
          });
          break;
      }
    }
  }
  const ov = (story.nachweise && story.nachweise.overrides) || {};
  for (const [id, o] of Object.entries(ov)) if (o.label) add(o.label, "Bildnachweis · Beschreibung", "text", orig, { nachweis: id });
  add(story.settings.footer, "Fusszeile");
  return out;
}
function layerTr(layers, lbl, o, ref, add) {
  for (const l of layers || []) {
    add(l.name, lbl(`Ebene «${tget(l.name, o, true)}» · Legende`), "text", o, ref);
    if (l.type === "line") add(l.label, lbl("Linie · Beschriftung"), "text", o, ref);
    if (l.type === "points") for (const p of l.points) { add(p.label, lbl("Punkt · Beschriftung"), "text", o, ref); add(p.popup, lbl("Punkt · Popup"), "text", o, ref); }
  }
}

export const BLOCK_LABEL = {
  text: "Text", subheading: "Zwischentitel", abstract: "Zusammenfassung", image: "Bild", table: "Tabelle",
  chart: "Live-Grafik", embed: "Einbettung", video: "Video", map: "Karte", tour: "Tour (3D)",
};

// ------------------------------------------------------------ citations used
export function citedKeys(story) {
  const keys = [];
  const push = (k) => { if (k && !keys.includes(k)) keys.push(k); };
  const scan = (html) => { const re = /data-keys="([^"]+)"/g; let m; while ((m = re.exec(html || ""))) m[1].split(",").forEach((k) => push(k.trim())); };
  for (const { obj } of translatables(story)) for (const k of Object.keys(obj)) if (k !== "_h") scan(obj[k]);
  for (const { b } of allBlocks(story)) {
    (b.sources || []).forEach(push);
    for (const l of b.layers || []) (l.sources || []).forEach(push);
  }
  return keys;
}

// ------------------------------------------------------------ checks before publishing
export function checks(story, citer, langs) {
  const out = [];
  const orig = ORIG(story);
  for (const lang of langs) {
    if (lang === orig) continue;
    const tr = translatables(story).filter((x) => tstatus(x.obj, lang, x.origLang) !== "ok" && x.origLang !== lang);
    const missing = tr.filter((x) => tstatus(x.obj, lang, x.origLang) === "missing").length;
    const outdated = tr.filter((x) => tstatus(x.obj, lang, x.origLang) === "outdated").length;
    if (missing) out.push({ level: "error", lang, view: "translate", text: `${lang.toUpperCase()}: ${missing} Textstellen nicht übersetzt` });
    if (outdated) out.push({ level: "warn", lang, view: "translate", text: `${lang.toUpperCase()}: ${outdated} Übersetzungen veraltet` });
  }
  for (const e of allImages(story)) {
    if (e.kind === "cover") continue;
    if (!tget(e.item.alt, (e.slide && e.slide.origLang) || orig, true)) out.push({ level: "warn", view: "write", ref: e.block ? e.block.id : e.id, text: `Bild ohne Alt-Text (${e.where})` });
    if (e.kind !== "video" && !e.item.src) out.push({ level: "error", view: "write", ref: e.block ? e.block.id : e.id, text: `Bild ohne Datei (${e.where})` });
  }
  const rows = nachweisRows(story, orig).filter((r) => r.status === "missing");
  if (rows.length) out.push({ level: "warn", view: "nachweise", text: `${rows.length} Bildnachweis(e) unvollständig` });
  if (citer) {
    for (const k of citedKeys(story)) {
      const e = citer.entries.get(k);
      if (!e) out.push({ level: "error", view: "quellen", text: `Zitierte Quelle «${k}» fehlt in der Bibliothek` });
      else if (e.fields.url && !e.fields.urldate && /^(online|dataset|misc)$/.test(e.type) && !e.fields.year && !e.fields.date)
        out.push({ level: "warn", view: "quellen", text: `Quelle «${k}» ohne Jahr und ohne Abrufdatum` });
    }
  }
  for (const { b, ch } of allBlocks(story)) {
    if (b.type === "embed" && !b.url) out.push({ level: "error", view: "write", ref: b.id, text: `Einbettung ohne Adresse (Kapitel «${tget(ch.nav, orig, true)}»)` });
    if (b.type === "video" && !(b.url || b.file)) out.push({ level: "error", view: "write", ref: b.id, text: `Video ohne Link oder Datei (Kapitel «${tget(ch.nav, orig, true)}»)` });
    if (b.type === "chart" && !b.template && !(b.custom && b.custom.url)) out.push({ level: "error", view: "write", ref: b.id, text: `Live-Grafik ohne Datenquelle (Kapitel «${tget(ch.nav, orig, true)}»)` });
  }
  return out;
}

export function emptyStory() {
  return {
    version: 1,
    settings: {
      languages: [{ code: "de", path: "de", label: "Deutsch" }, { code: "fr", path: "fr", label: "Français" }],
      originalLanguage: "de", rootRedirect: "browser", domain: "", basePath: "", decimalCommaFr: true,
      logo: "", logoAlt: "", logoHref: "", footer: { de: "" },
    },
    cover: { title: { de: "Titel der Story" }, subtitle: { de: "" }, byline: "", image: "", alt: { de: "" }, credit: { author: "", year: "" }, creditLabel: { de: "Titelbild" } },
    chapters: [{ id: "einleitung", nav: { de: "Einleitung" }, title: { de: "Einleitung" }, blocks: [newBlock("text")] }],
    nachweise: { overrides: {} },
  };
}
