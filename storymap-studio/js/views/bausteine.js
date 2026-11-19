// bausteine.js — overview: block types and every block in the story
import { state, emit, markDirty, mediaUrl } from "../state.js";
import { tget, ORIG, allBlocks, BLOCK_LABEL, newBlock } from "../model.js";
import { MENU, presetBlock, CHART_TEMPLATES } from "../blocks.js";
import { esc, icon, stripTags } from "../lib/util.js";

let filter = "all";

export function renderBausteine(root) {
  const story = state.story, lang = state.lang, orig = ORIG(story);
  const items = [...allBlocks(story)];
  const counts = {};
  items.forEach(({ b }) => (counts[b.type] = (counts[b.type] || 0) + 1));
  root.innerHTML = `
  <div class="page">
    <div class="page-head"><h1>Bausteine</h1>
      <p class="muted">Alle Bausteine der Story auf einen Blick. Anklicken öffnet den Baustein im Text; Karten und Touren öffnen den Tour-Editor.</p></div>
    <section class="types">
      <h2>Neuen Baustein einfügen</h2>
      <div class="f-row f-wrap"><label class="f">In Kapitel
        <select id="target">${story.chapters.map((c) => `<option value="${c.id}" ${c.id === state.chapterId ? "selected" : ""}>${esc(tget(c.nav, lang, orig))}</option>`).join("")}</select></label></div>
      <div class="type-grid">${MENU.map((m, i) => `
        <button class="type-card" data-i="${i}"><span class="menu-icon">${icon(m.icon, 20)}</span>
          <span><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span></button>`).join("")}</div>
    </section>
    <section>
      <div class="f-row f-wrap filter" role="group" aria-label="Filter">
        <button data-f="all" class="chip ${filter === "all" ? "is-on" : ""}">Alle (${items.length})</button>
        ${Object.keys(BLOCK_LABEL).filter((k) => counts[k]).map((k) => `<button data-f="${k}" class="chip ${filter === k ? "is-on" : ""}">${BLOCK_LABEL[k]} (${counts[k]})</button>`).join("")}
      </div>
      <div class="blk-grid">${items.filter(({ b }) => filter === "all" || b.type === filter).map(({ ch, b }) => cardHtml(ch, b, lang, orig)).join("")}</div>
    </section>
  </div>`;
  root.querySelectorAll("img[data-src]").forEach(async (img) => (img.src = await mediaUrl(img.dataset.src)));
  root.querySelector(".filter").onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { filter = b.dataset.f; renderBausteine(root); } };
  root.querySelector(".type-grid").onclick = (e) => {
    const c = e.target.closest("[data-i]"); if (!c) return;
    const m = MENU[+c.dataset.i];
    const ch = story.chapters.find((x) => x.id === root.querySelector("#target").value);
    const b = presetBlock(newBlock(m.type, lang), m.preset);
    ch.blocks.push(b); markDirty();
    state.chapterId = ch.id; state.blockId = b.id;
    if (b.type === "map" || b.type === "tour") { state.tourBlockId = b.id; state.view = "tour"; } else state.view = "write";
    emit("view");
  };
  root.querySelector(".blk-grid").onclick = (e) => {
    const c = e.target.closest("[data-id]"); if (!c) return;
    const x = items.find(({ b }) => b.id === c.dataset.id);
    state.chapterId = x.ch.id; state.blockId = x.b.id;
    if (x.b.type === "map" || x.b.type === "tour") { state.tourBlockId = x.b.id; state.view = "tour"; } else state.view = "write";
    emit("view");
  };
}

function cardHtml(ch, b, lang, orig) {
  const meta = MENU.find((m) => m.type === b.type && !m.preset);
  let title = "", detail = "", thumb = "";
  switch (b.type) {
    case "text": title = stripTags(tget(b.html, lang, orig)).slice(0, 110) + "…"; break;
    case "subheading": title = tget(b.text, lang, orig); break;
    case "abstract": title = tget(b.title, lang, orig); detail = stripTags(tget(b.html, lang, orig)).slice(0, 90) + "…"; break;
    case "image": title = tget(b.caption, lang, orig) || b.src; detail = b.credit && b.credit.author ? `Bildnachweis: ${b.credit.author} ${b.credit.year || ""}` : "Bildnachweis fehlt";
      thumb = b.src ? `<img alt="" data-src="${esc(b.src)}">` : ""; break;
    case "table": title = tget(b.title, lang, orig); detail = `${b.header.length} Spalten · ${b.rows.length} Zeilen`; break;
    case "chart": title = tget(b.title, lang, orig) || tget(b.caption, lang, orig);
      detail = b.template ? (CHART_TEMPLATES.find((t) => t[0] === b.template) || [, ""])[1] : "Eigene Datenquelle"; break;
    case "embed": title = tget(b.title, lang, orig) || b.url; detail = b.url; break;
    case "video": title = tget(b.caption, lang, orig) || "Video"; detail = b.provider; break;
    case "map": title = tget(b.caption, lang, orig) || "Karte"; detail = `${b.layers.length} Ebene(n)`; break;
    case "tour": title = b.slides.map((s) => tget(s.title, lang, s.origLang || orig) || tget(s.title, s.origLang || orig, true)).join(" · ");
      detail = `${b.slides.length} Folie(n) · ${b.layers.length} Ebene(n) · Tour-Editor öffnen`; break;
  }
  return `<button class="blk-card" data-id="${b.id}">
    <span class="blk-card-top"><span class="menu-icon">${icon(meta ? meta.icon : "text", 16)}</span>${BLOCK_LABEL[b.type]}
      <span class="muted">· ${esc(tget(ch.nav, lang, orig))}</span></span>
    ${thumb ? `<span class="blk-thumb">${thumb}</span>` : ""}
    <b>${esc(title || "–")}</b><small class="muted">${esc(detail || "")}</small></button>`;
}
