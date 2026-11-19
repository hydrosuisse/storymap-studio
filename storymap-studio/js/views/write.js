// write.js — the writing view: chapters, text and blocks, settings panel.
import { state, emit, markDirty } from "../state.js";
import { tget, tset, ORIG, newBlock, findBlock, BLOCK_LABEL, nachweisRows } from "../model.js";
import { card, schema, presetBlock, MENU } from "../blocks.js";
import { renderForm, h } from "../forms.js";
import { command, closePopup } from "../richtext.js";
import { blockMenu, chapterSlug, refreshCitations } from "./common.js";
import { esc, icon, debounce, ask } from "../lib/util.js";
import { t } from "../lib/i18n.js";

const COVER = "__cover";

export function renderWrite(root) {
  const story = state.story;
  if (!state.chapterId || (state.chapterId !== COVER && !story.chapters.find((c) => c.id === state.chapterId)))
    state.chapterId = story.chapters[0] ? story.chapters[0].id : COVER;
  root.innerHTML = `
    <nav class="side" aria-label="${t("chapters")}"></nav>
    <main class="center">
      <div class="fmt" role="toolbar" aria-label="Textformat">
        <button data-cmd="bold" aria-label="Fett"><b>B</b></button>
        <button data-cmd="italic" aria-label="Kursiv"><i>I</i></button>
        <button data-cmd="superscript" aria-label="Hochgestellt">m<sup>3</sup></button>
        <button data-cmd="subscript" aria-label="Tiefgestellt">CO<sub>2</sub></button>
        <span class="sep"></span>
        <button data-cmd="insertUnorderedList" aria-label="Aufzählung">${icon("list", 16)}</button>
        <button data-cmd="insertOrderedList" aria-label="Nummerierte Liste">1.</button>
        <button data-cmd="link" aria-label="Link">${icon("link", 16)}</button>
        <button data-cmd="removeFormat" aria-label="Formatierung entfernen">T<sub>x</sub></button>
        <span class="sep"></span>
        <button data-cmd="cite" class="fmt-cite">Zitieren <span class="muted">@</span></button>
        <span class="fmt-tip">«@» oder «\\cite{» tippen – Quellen werden vorgeschlagen${state.lang !== ORIG(story) ? ` · Sie bearbeiten die Fassung <b>${state.lang.toUpperCase()}</b>` : ""}</span>
      </div>
      <div class="doc-wrap"><article class="doc" lang="${state.lang}"></article></div>
    </main>
    <aside class="inspector" aria-label="Einstellungen"></aside>`;
  root.querySelector(".fmt").addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
  root.querySelector(".fmt").addEventListener("click", (e) => { const b = e.target.closest("[data-cmd]"); if (b) command(b.dataset.cmd); });
  renderSide(root.querySelector(".side"));
  renderDoc(root.querySelector(".doc"));
  renderInspector(root.querySelector(".inspector"));
}

// ------------------------------------------------------------ chapters
function renderSide(el) {
  const story = state.story, lang = state.lang, orig = ORIG(story);
  const rows = nachweisRows(story, orig);
  const open = rows.filter((r) => r.status === "missing").length;
  el.innerHTML = `
    <div class="side-h">${t("chapters")}</div>
    <a href="#" data-ch="${COVER}" class="side-item${state.chapterId === COVER ? " is-on" : ""}">${t("cover")}</a>
    <ol class="side-list">${story.chapters.map((c, i) => `
      <li><a href="#" data-ch="${c.id}" class="side-item${c.id === state.chapterId ? " is-on" : ""}" ${c.id === state.chapterId ? 'aria-current="page"' : ""}>
        <span>${esc(tget(c.nav, lang, orig) || "Ohne Titel")}</span><span class="muted">${c.blocks.length}</span></a></li>`).join("")}
    </ol>
    <button class="side-add" id="add-ch">${t("addChapter")}</button>
    <div class="side-h">${t("auto")}</div>
    <a href="#" data-view="quellen" class="side-item">Quellen <span class="muted">${state.citer ? state.citer.usedOrder.length : 0}</span></a>
    <a href="#" data-view="nachweise" class="side-item">Bildnachweise <span class="${open ? "warn" : "muted"}">${rows.length}${open ? " · " + open + " offen" : ""}</span></a>
    <a href="#" data-view="nachweise" class="side-item">Tabellennachweise</a>
    <a href="#" data-view="bausteine" class="side-item">Alle Bausteine</a>
    <p class="side-note">Quellen: nur zitierte Einträge (APA 6). Nachweise: Vorschläge aus den Bausteinen, anpassbar.</p>`;
  el.onclick = (e) => {
    const a = e.target.closest("a");
    if (a) {
      e.preventDefault();
      if (a.dataset.view) { state.view = a.dataset.view; emit("view"); return; }
      state.chapterId = a.dataset.ch; state.blockId = null; emit("view");
    }
  };
  el.querySelector("#add-ch").onclick = () => {
    const id = chapterSlug("kapitel", story.chapters.map((c) => c.id));
    story.chapters.push({ id, nav: { [lang]: "Neues Kapitel" }, title: { [lang]: "Neues Kapitel" }, blocks: [newBlock("text", lang)] });
    state.chapterId = id; state.blockId = null; markDirty(); emit("view");
  };
}

// ------------------------------------------------------------ document
function renderDoc(el) {
  const story = state.story, lang = state.lang;
  if (state.chapterId === COVER) return renderCover(el);
  const ch = story.chapters.find((c) => c.id === state.chapterId);
  const orig = ORIG(story);
  el.innerHTML = "";
  const nav = h("input", { class: "nav-input", value: tget(ch.nav, lang), placeholder: tget(ch.nav, orig), lang, "aria-label": "Name in der Navigation" });
  nav.addEventListener("input", () => { tset(ch.nav, lang, nav.value, orig); markDirty(); refreshSide(); });
  const title = h("input", { class: "ch-title", value: tget(ch.title, lang), placeholder: tget(ch.title, orig) || "Kapiteltitel", lang, "aria-label": "Kapiteltitel" });
  title.addEventListener("input", () => { tset(ch.title, lang, title.value, orig); markDirty(); });
  const idx = story.chapters.indexOf(ch);
  const tools = h("div", { class: "ch-tools" },
    h("button", { class: "btn btn-small", disabled: idx === 0, onclick: () => moveChapter(ch, -1), "aria-label": "Kapitel nach oben" }, icon("up", 14)),
    h("button", { class: "btn btn-small", disabled: idx === story.chapters.length - 1, onclick: () => moveChapter(ch, 1), "aria-label": "Kapitel nach unten" }, icon("down", 14)),
    h("button", { class: "btn btn-small btn-danger", onclick: () => deleteChapter(ch) }, "Kapitel löschen"));
  el.append(h("div", { class: "ch-head" }, h("label", { class: "ch-nav" }, h("span", { class: "muted small" }, "Navigation: "), nav), tools), title);
  el.appendChild(insertLine(ch, 0));
  ch.blocks.forEach((b, i) => { el.appendChild(blockWrap(ch, b, i)); el.appendChild(insertLine(ch, i + 1)); });
}

function blockWrap(ch, b, i) {
  const sel = b.id === state.blockId;
  const w = h("section", { class: "blk blk-" + b.type + (sel ? " is-sel" : ""), "data-id": b.id, "aria-label": BLOCK_LABEL[b.type] });
  const bar = h("div", { class: "blk-bar" },
    h("span", { class: "blk-tag" }, BLOCK_LABEL[b.type] + (b.width && b.width !== "standard" ? ` · ${b.width === "wide" ? "Breit" : "Ganze Breite"}` : "")),
    h("button", { class: "icon-btn", "aria-label": "Nach oben", disabled: i === 0, onclick: (e) => { e.stopPropagation(); moveBlock(ch, i, -1); } }, h("span", { html: icon("up", 14) })),
    h("button", { class: "icon-btn", "aria-label": "Nach unten", disabled: i === ch.blocks.length - 1, onclick: (e) => { e.stopPropagation(); moveBlock(ch, i, 1); } }, h("span", { html: icon("down", 14) })),
    h("button", { class: "icon-btn", "aria-label": "Duplizieren", onclick: (e) => { e.stopPropagation(); duplicate(ch, i); } }, h("span", { html: icon("copy", 14) })),
    h("button", { class: "icon-btn", "aria-label": "Löschen", onclick: (e) => { e.stopPropagation(); removeBlock(ch, i); } }, h("span", { html: icon("trash", 14) })));
  w.appendChild(bar);
  w.appendChild(card(b, { lang: state.lang, onChange: () => { refreshCitationsSoon(); } }));
  w.addEventListener("focusin", () => select(b.id));
  w.addEventListener("click", () => select(b.id));
  return w;
}

function insertLine(ch, at) {
  const btn = h("button", { class: "ins-btn", "aria-label": t("insert") }, "+");
  btn.addEventListener("click", () => blockMenu(btn, (type, preset) => {
    const b = presetBlock(newBlock(type, state.lang), preset);
    ch.blocks.splice(at, 0, b);
    state.blockId = b.id; markDirty(); emit("view");
    if (type === "map" || type === "tour") { state.tourBlockId = b.id; state.view = "tour"; emit("view"); }
  }));
  return h("div", { class: "ins" }, btn, h("span", { class: "ins-line" }));
}

function select(id) {
  if (state.blockId === id) return;
  state.blockId = id;
  document.querySelectorAll(".blk").forEach((x) => x.classList.toggle("is-sel", x.dataset.id === id));
  renderInspector(document.querySelector(".inspector"));
}

const refreshCitationsSoon = debounce(() => refreshCitations(), 600);
function refreshSide() { const s = document.querySelector(".side"); if (s) renderSide(s); }
const refreshCard = debounce((id) => {
  const x = findBlock(state.story, id);
  const w = document.querySelector(`.blk[data-id="${id}"]`);
  if (!x || !w || w.contains(document.activeElement)) return;
  w.replaceWith(blockWrap(x.ch, x.b, x.bi));
}, 250);

function moveBlock(ch, i, d) {
  const j = i + d; if (j < 0 || j >= ch.blocks.length) return;
  [ch.blocks[i], ch.blocks[j]] = [ch.blocks[j], ch.blocks[i]]; markDirty(); emit("view");
}
function duplicate(ch, i) {
  const c = JSON.parse(JSON.stringify(ch.blocks[i]));
  c.id = c.type.slice(0, 3) + Math.random().toString(36).slice(2, 8);
  ch.blocks.splice(i + 1, 0, c); state.blockId = c.id; markDirty(); emit("view");
}
async function removeBlock(ch, i) {
  const b = ch.blocks[i];
  if (!(await ask(`${BLOCK_LABEL[b.type]} wirklich löschen?`, { ok: "Löschen", danger: true }))) return;
  ch.blocks.splice(i, 1); if (state.blockId === b.id) state.blockId = null; markDirty(); emit("view");
}
function moveChapter(ch, d) {
  const a = state.story.chapters, i = a.indexOf(ch), j = i + d;
  [a[i], a[j]] = [a[j], a[i]]; markDirty(); emit("view");
}
async function deleteChapter(ch) {
  if (!(await ask(`Kapitel «${tget(ch.nav, state.lang, ORIG(state.story))}» mit ${ch.blocks.length} Bausteinen löschen?`, { ok: "Löschen", danger: true }))) return;
  const a = state.story.chapters; a.splice(a.indexOf(ch), 1);
  state.chapterId = a[0] ? a[0].id : COVER; markDirty(); emit("view");
}

// ------------------------------------------------------------ inspector
function renderInspector(el) {
  if (!el) return;
  closePopup();
  el.innerHTML = "";
  if (state.chapterId === COVER) return renderSettingsPanel(el);
  const x = state.blockId && findBlock(state.story, state.blockId);
  if (!x) {
    const ch = state.story.chapters.find((c) => c.id === state.chapterId);
    el.append(h("div", { class: "insp-head" }, h("div", {}, h("div", { class: "muted small" }, "Kapitel"), h("h2", {}, tget(ch.nav, state.lang, ORIG(state.story))))),
      renderForm(ch, [
        { key: "id", label: "Adresse des Kapitels (Anker)", type: "text", help: "Wird zu …/de/#" + ch.id + " – nur Kleinbuchstaben, Ziffern und Bindestriche." },
        { type: "note", label: "Einen Baustein anklicken, um ihn hier einzustellen. Neue Bausteine mit «+» zwischen den Absätzen einfügen." }],
        { onChange: (k) => { if (k === "id") { ch.id = ch.id.toLowerCase().replace(/[^a-z0-9-]/g, "-"); state.chapterId = ch.id; } } }));
    return;
  }
  const b = x.b;
  el.append(h("div", { class: "insp-head" },
    h("div", {}, h("div", { class: "muted small" }, "Ausgewählter Baustein"), h("h2", {}, BLOCK_LABEL[b.type])),
    h("button", { class: "btn btn-small btn-danger", onclick: () => removeBlock(x.ch, x.bi) }, "Entfernen")));
  el.appendChild(renderForm(b, schema(b), { onChange: (k, rerender) => {
    refreshCard(b.id);
    if (k === "sources") refreshCitationsSoon();
    if (rerender) renderInspector(el);
  } }));
  if (state.lang !== ORIG(state.story)) el.appendChild(h("p", { class: "alert alert-info" }, `Sie bearbeiten die Fassung ${state.lang.toUpperCase()}. Leere Felder zeigen das Original als Hinweis.`));
}

// ------------------------------------------------------------ cover & story settings
function renderCover(el) {
  const story = state.story;
  el.innerHTML = "";
  el.append(h("h2", { class: "doc-h" }, "Titelbild"),
    renderForm(story.cover, [
      { key: "title", label: "Titel", type: "i18n" },
      { key: "subtitle", label: "Untertitel", type: "i18n" },
      { key: "byline", label: "Autor/in", type: "text" },
      { key: "image", label: "Titelbild", type: "media", accept: "image/*" },
      { key: "alt", label: "Alt-Text des Titelbilds", type: "i18n" },
      { key: "creditLabel", label: "Beschreibung im Bildnachweis", type: "i18n" },
      { key: "credit", label: "Bildnachweis", type: "credit" },
    ]),
    h("h2", { class: "doc-h" }, "Kopfzeile und Fusszeile"),
    renderForm(story.settings, [
      { key: "logo", label: "Logo", type: "media", accept: "image/*" },
      { key: "logoAlt", label: "Name hinter dem Logo (für Screenreader)", type: "text" },
      { key: "logoHref", label: "Link des Logos", type: "url", placeholder: "https://…" },
      { key: "footer", label: "Fusszeile", type: "i18n" },
    ]));
}

function renderSettingsPanel(el) {
  const s = state.story.settings;
  const langs = h("div", { class: "f" }, h("span", { class: "f-label" }, "Sprachen der Story"));
  s.languages.forEach((l, i) => {
    const row = h("div", { class: "f-row" },
      h("span", { class: "chip" + (l.code === ORIG(state.story) ? " chip-info" : "") }, l.code.toUpperCase()),
      h("span", {}, l.label + (l.code === ORIG(state.story) ? " (Original)" : "")),
      l.code !== ORIG(state.story) ? h("button", { class: "btn btn-small", onclick: async () => {
        if (!(await ask(`Sprache ${l.label} entfernen? Übersetzte Texte bleiben in der Datei, werden aber nicht mehr veröffentlicht.`, { ok: "Entfernen", danger: true }))) return;
        s.languages.splice(i, 1); markDirty(); state.lang = ORIG(state.story); emit("langs");
      } }, "Entfernen") : null);
    langs.appendChild(row);
  });
  const add = h("select", { "aria-label": "Sprache hinzufügen" }, h("option", { value: "" }, "+ Sprache hinzufügen"),
    ...[["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"], ["en", "English"], ["rm", "Rumantsch"]]
      .filter(([c]) => !s.languages.some((l) => l.code === c)).map(([c, l]) => h("option", { value: c }, l)));
  add.addEventListener("change", () => {
    if (!add.value) return;
    s.languages.push({ code: add.value, path: add.value, label: add.options[add.selectedIndex].text });
    markDirty(); emit("langs");
  });
  langs.appendChild(add);
  el.append(h("div", { class: "insp-head" }, h("h2", {}, "Story-Einstellungen")), langs,
    h("p", { class: "f-help" }, "Adresse (Domain, …/de/, …/fr/) und Veröffentlichen: im Bereich «Veröffentlichen»."));
}
