// preview.js — live preview of the story page in the browser (text, images, tables,
// citations, credits; embeds and published charts load live; maps and tours are built
// by GitHub and shown here as placeholders).
import { state, mediaUrl, siteUrl } from "../state.js";
import { tget, ORIG, nachweisRows, allTables, tableNumber } from "../model.js";
import { makeCiter, TERMS } from "../lib/cite.js";
import { esc, modal } from "../lib/util.js";

export async function openPreview(lang = state.lang) {
  const html = await buildPage(lang);
  const d = modal(`<div class="prev-bar"><b>Vorschau</b>
      <div class="seg" role="group" aria-label="Fassung">${state.story.settings.languages.map((l) => `<button data-l="${l.code}" class="${l.code === lang ? "is-on" : ""}">${l.code.toUpperCase()}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="Gerät"><button data-w="100%" class="is-on">Desktop</button><button data-w="390px">Smartphone</button></div>
      <span class="muted small">Karten, Touren und 3D-Gelände erscheinen auf der Vorschau-Seite von GitHub und der veröffentlichten Seite.</span>
      <button class="btn" value="close">Schliessen</button></div>
    <div class="prev-frame-wrap"><iframe class="prev-frame" title="Vorschau der Story"></iframe></div>`, { wide: true });
  d.classList.add("modal-preview");
  const f = d.querySelector("iframe");
  f.srcdoc = html;
  d.querySelector("[value=close]").onclick = () => d.close();
  d.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { d.close(); openPreview(b.dataset.l); }));
  d.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => {
    f.style.width = b.dataset.w; d.querySelectorAll("[data-w]").forEach((x) => x.classList.toggle("is-on", x === b));
  }));
}

const W = { standard: "standard", wide: "wide", full: "full" };

export async function buildPage(lang) {
  const story = state.story, orig = ORIG(story), s = story.settings;
  const citer = makeCiter(state.bib || "", { defaultLang: orig });
  const cites = [];
  const T = TERMS[lang] || TERMS.de;
  // text in this language, or the original marked with its language
  const txt = (o, o2 = orig) => {
    const v = tget(o, lang);
    if (v) return { v, l: lang };
    return { v: tget(o, o2, true), l: o2 };
  };
  const htmlOf = (o, o2) => {
    const { v, l } = txt(o, o2);
    const body = String(v || "").replace(/<cite data-keys="([^"]+)" data-form="(p|t)"(?: data-page="([^"]*)")?><\/cite>/g, (_, k, f, p) => {
      cites.push({ keys: k.split(","), form: f, page: p }); return `\u0000C${cites.length - 1}\u0000`;
    });
    return l === lang ? body : body.replace(/<(p|ul|ol)>/g, `<$1 lang="${l}">`);
  };
  const plain = (o, o2) => { const { v, l } = txt(o, o2); return l === lang ? esc(v) : `<span lang="${l}">${esc(v)}</span>`; };
  const srcLine = (keys, prefix) => {
    if (!keys || !keys.length) return "";
    cites.push({ keys, form: "t" });
    return `<span class="sm-source">${prefix || ((keys.length > 1 ? T.sources : T.source) + (lang === "fr" ? " : " : ": "))}\u0000C${cites.length - 1}\u0000</span>`;
  };
  const media = async (p) => (p ? await mediaUrl(p) : "");
  const figcap = (cap, keys, prefix) => {
    const c = cap ? cap : "", sl = srcLine(keys, prefix);
    return c || sl ? `<figcaption class="sm-caption">${c}${c && sl ? "<br>" : ""}${sl}</figcaption>` : "";
  };

  const parts = [];
  // header + cover
  if (s.logo) parts.push(`<header class="sm-header"><a href="${esc(s.logoHref || "#")}"><img class="sm-logo" src="${await media(s.logo)}" alt="${esc(s.logoAlt || "")}"></a></header>`);
  const c = story.cover;
  parts.push(`<section class="sm-cover">${c.image ? `<img class="sm-cover-img" src="${await media(c.image)}" alt="${esc(tget(c.alt, lang, orig))}">` : ""}
    <div class="sm-cover-gradient"></div><div class="sm-cover-panel"><h1 class="sm-cover-title">${plain(c.title)}</h1>
    ${tget(c.subtitle, lang, orig) ? `<p class="sm-cover-summary">${plain(c.subtitle)}</p>` : ""}${c.byline ? `<p class="sm-cover-meta">${esc(c.byline)}</p>` : ""}</div>
    <a class="sm-cover-scroll" href="#sm-start" aria-label="Weiterlesen">&#8964;</a></section>`);
  const navLinks = story.chapters.map((ch) => `<li><a href="#${esc(ch.id)}" data-target="${esc(ch.id)}">${plain(ch.nav)}</a></li>`);
  navLinks.push(`<li><a href="#quellen" data-target="quellen">${lang === "fr" ? "Sources" : lang === "en" ? "References" : "Quellen"}</a></li>`);
  parts.push(`<nav class="sm-nav" id="sm-start" aria-label="Inhalt"><ul>${navLinks.join("")}</ul></nav>`);

  for (const ch of story.chapters) {
    const out = [`<div id="${esc(ch.id)}" class="section level2"><h2>${plain(ch.title)}</h2>`];
    for (const b of ch.blocks) {
      const o = b.origLang || orig;
      switch (b.type) {
        case "text": out.push(htmlOf(b.html, o)); break;
        case "subheading": out.push(`<h3>${plain(b.text, o)}</h3>`); break;
        case "abstract": out.push(`<div class="sm-abstract"><span class="sm-abstract-titel${b.titleSize === "small" ? " is-small" : ""}">${plain(b.title, o)}</span>${htmlOf(b.html, o)}</div>`); break;
        case "image": {
          const img = `<img src="${await media(b.src)}" alt="${esc(tget(b.alt, lang, o))}" loading="lazy">`;
          out.push(`<figure class="sm-block sm-${W[b.width] || "standard"} sm-image">${b.zoom ? `<button type="button" class="sm-zoom" data-full="${await media(b.src)}">${img}<span class="sm-zoom-icon" aria-hidden="true">&#x2922;</span></button>` : img}
            ${figcap(plain(b.caption, o), b.sources)}</figure>`);
          break;
        }
        case "table": {
          const n = tableNumber(story, b.id);
          out.push(`<figure class="sm-block sm-standard sm-table"><figcaption class="sm-table-title"><b>${lang === "fr" ? "Tableau" : "Tabelle"} ${n}:</b> ${plain(b.title, o)}</figcaption>
            <table><thead><tr>${b.header.map((hc, i) => `<th style="text-align:${b.align[i] || "left"}">${plain(hc, o)}</th>`).join("")}</tr></thead>
            <tbody>${b.rows.map((r) => `<tr>${r.map((cell, i) => `<td style="text-align:${b.align[i] || "left"}">${plain(cell, o)}</td>`).join("")}</tr>`).join("")}</tbody></table>
            ${figcap("", b.sources, (lang === "fr" ? "Données : " : "Daten: "))}</figure>`);
          break;
        }
        case "chart": {
          const page = b.template ? { speicherseen: "speicherseen", produktion_handel: "produktion", produktion: "produktion_bfe" }[b.template] : `chart-${b.id}`;
          const url = state.mode === "github" ? `${siteUrl()}charts/${page}.html` : "";
          out.push(url ? frame(url, plain(b.title, o), "560px", "560px", true, "lazy", plain(b.caption, o), srcLine(b.sources))
            : placeholder("Live-Grafik", plain(b.title, o) || plain(b.caption, o), figcap(plain(b.caption, o), b.sources)));
          break;
        }
        case "embed": out.push(b.url ? frame(b.url, plain(b.title, o), b.heightDesktop, b.heightMobile, false, b.load, plain(b.caption, o),
            srcLine(b.sources, b.sourcePrefix === "data" ? (lang === "fr" ? "Données : " : "Daten: ") : null), tget(b.loadingText, lang, o)) : placeholder("Einbettung", "noch keine Adresse", "")); break;
        case "video": out.push(await video(b, lang, o, plain, figcap, media)); break;
        case "map": out.push(placeholder("Karte", `${b.layers.length} Ebene(n)`, figcap(plain(b.caption, o), b.sources))); break;
        case "tour":
          out.push(`<section class="sm-block sm-wide prev-tour"><div class="prev-ph-label">Tour (3D) – Karte wird beim Build erzeugt</div>
            ${b.slides.map((sl) => `<div class="sm-slide-card"><h3>${plain(sl.title, sl.origLang || o)}</h3>${htmlOf(sl.html, sl.origLang || o)}</div>`).join("")}</section>`);
          break;
      }
    }
    out.push("</div>");
    parts.push(out.join("\n"));
  }

  // Quellen, Nachweise
  citer.reset();
  const formatted = citer.cite(cites);
  const refs = citer.references();
  const rows = nachweisRows(story, lang);
  const tables = allTables(story);
  parts.push(`<div id="quellen" class="section level2"><h2>${lang === "fr" ? "Sources" : lang === "en" ? "References" : "Quellen"}</h2>
    ${refs.map((r) => `<p id="ref-${esc(r.key)}" class="sm-ref" lang="${r.lang}">${r.html}</p>`).join("")}
    <h3>${lang === "fr" ? "Crédits photographiques" : lang === "en" ? "Image credits" : "Bildnachweise"}</h3>
    <table class="sm-credits"><tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.credit)}</td></tr>`).join("")}</tbody></table>
    ${tables.length ? `<h3>${lang === "fr" ? "Sources des tableaux" : lang === "en" ? "Table sources" : "Tabellennachweise"}</h3>
    <table class="sm-credits"><tbody>${tables.map((t) => `<tr><td>${lang === "fr" ? "Tableau" : "Tabelle"} ${t.n}: ${esc(tget(t.item.title, lang, orig))}</td><td>${t.item.sources.length ? citer.sourceLine(t.item.sources, lang, lang === "fr" ? "Données : " : "Daten: ") : ""}</td></tr>`).join("")}</tbody></table>` : ""}
  </div>`);
  if (tget(s.footer, lang, orig)) parts.push(`<footer class="sm-footer">${plain(s.footer)}</footer>`);

  const body = parts.join("\n").replace(/\u0000C(\d+)\u0000/g, (_, i) => formatted[+i] || "");
  const base = new URL("preview/", location.href).href;
  return `<!doctype html><html lang="${lang}" ${lang === "fr" && s.decimalCommaFr ? 'data-decimal="comma"' : ""}><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Vorschau</title>
    <link rel="stylesheet" href="${base}storymap.css"><link rel="stylesheet" href="${base}preview-extra.css">
    <script src="${base}storymap.js"></script></head><body><div class="main-container">${body}</div></body></html>`;
}

function frame(src, title, hD, hM, auto, load, caption, sourceHtml, loadingText) {
  return `<figure class="sm-block sm-wide sm-frame"><div class="sm-frame-box" style="--sm-frame-h:${esc(hD || "600px")};--sm-frame-h-mobile:${esc(hM || hD || "600px")};">
    <div class="sm-frame-loading"><span class="sm-spinner"></span><span>${esc(loadingText || "Wird geladen …")}</span></div>
    <iframe data-src="${esc(src)}" title="${title}" allow="fullscreen" ${auto ? 'data-auto-height="true"' : ""} data-load="${load === "after_page" ? "after_page" : "lazy"}" ${load === "after_page" ? 'data-delay="2000"' : ""}></iframe></div>
    <figcaption class="sm-caption">${caption || ""}${caption ? "<br>" : ""}<span class="sm-source">${sourceHtml ? sourceHtml.replace(/^<span class="sm-source">|<\/span>$/g, "") + " · " : ""}<a href="${esc(src)}" target="_blank" rel="noopener">In neuem Fenster öffnen</a></span></figcaption></figure>`;
}
function placeholder(kind, title, cap) {
  return `<figure class="sm-block sm-wide prev-ph"><div class="prev-ph-box"><b>${kind}</b><span>${title || ""}</span></div>${cap}</figure>`;
}
export function videoEmbedUrl(provider, url) {
  const u = String(url || "");
  if (provider === "youtube") { const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/.exec(u); return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` : ""; }
  if (provider === "vimeo") { const m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(u); return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1&dnt=1` : ""; }
  if (provider === "switchtube") { const m = /tube\.switch\.ch\/(?:videos|embed)\/([\w-]+)/.exec(u); return m ? `https://tube.switch.ch/embed/${m[1]}` : ""; }
  return "";
}
async function video(b, lang, o, plain, figcap, media) {
  const cap = figcap(plain(b.caption, o), b.sources);
  const poster = b.poster ? await media(b.poster) : "";
  if (b.provider === "file") {
    const src = await media(b.file);
    const tr = await Promise.all(Object.entries(b.subtitles || {}).map(async ([l, p]) => `<track kind="subtitles" srclang="${l}" label="${l.toUpperCase()}" src="${await media(p)}" ${l === lang ? "default" : ""}>`));
    return `<figure class="sm-block sm-${W[b.width] || "wide"} sm-video"><video controls preload="metadata" ${poster ? `poster="${poster}"` : ""} ${b.autoplayLoop ? "autoplay muted loop playsinline" : ""} src="${src}" aria-label="${esc(tget(b.alt, lang, o))}">${tr.join("")}</video>${cap}</figure>`;
  }
  const emb = videoEmbedUrl(b.provider, b.url);
  const name = { youtube: "YouTube", vimeo: "Vimeo", switchtube: "SWITCHtube" }[b.provider];
  return `<figure class="sm-block sm-${W[b.width] || "wide"} sm-video"><div class="sm-video-box" ${poster ? `style="background-image:url('${poster}')"` : ""}>
    <button type="button" class="sm-video-play" data-embed="${esc(emb)}" aria-label="Video abspielen: ${esc(tget(b.alt, lang, o))}"><span class="sm-video-icon" aria-hidden="true">&#9654;</span>
    <span class="sm-video-note">${lang === "fr" ? `Lire la vidéo – chargée depuis ${name}` : `Video abspielen – wird von ${name} geladen`}</span></button></div>${cap}</figure>`;
}
