// richtext.js — text editing with citation suggestions while typing.
//   Typing «@» or «\cite{» opens suggestions from the source library.
//   Citations are stored as <cite data-keys="a,b" data-form="p|t" data-page="">.
import { state } from "./state.js";
import { esc, ask } from "./lib/util.js";
import { textCitationsToMarkup } from "./lib/cite.js";

const ALLOWED = new Set(["P", "BR", "B", "I", "SUP", "SUB", "UL", "OL", "LI", "A", "CITE"]);
const RENAME = { STRONG: "B", EM: "I", DIV: "P", H1: "P", H2: "P", H3: "P", H4: "P" };

// clean HTML for storage: allowed tags only, citations empty, text citations converted
export function cleanHtml(html, { block = true } = {}) {
  const tpl = document.createElement("template");
  tpl.innerHTML = textCitationsToMarkup(String(html || "").replace(/ /g, " "));
  const out = document.createElement("div");
  const walk = (src, dst) => {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1) continue;
      let tag = RENAME[n.tagName] || n.tagName;
      if (!ALLOWED.has(tag)) { walk(n, dst); continue; }
      const el = document.createElement(tag);
      if (tag === "A") {
        const href = n.getAttribute("href") || "";
        if (/^(https?:|mailto:|#)/.test(href)) el.setAttribute("href", href);
      }
      if (tag === "CITE") {
        const keys = (n.getAttribute("data-keys") || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!keys.length) continue;
        el.setAttribute("data-keys", keys.join(","));
        el.setAttribute("data-form", n.getAttribute("data-form") === "t" ? "t" : "p");
        const pg = n.getAttribute("data-page"); if (pg) el.setAttribute("data-page", pg);
        dst.appendChild(el);
        continue;
      }
      walk(n, el);
      dst.appendChild(el);
    }
  };
  walk(tpl.content, out);
  if (block) {
    // wrap loose inline content into <p>
    const fixed = document.createElement("div");
    let p = null;
    for (const n of [...out.childNodes]) {
      const isBlock = n.nodeType === 1 && /^(P|UL|OL)$/.test(n.tagName);
      if (isBlock) { p = null; fixed.appendChild(n); }
      else {
        if (n.nodeType === 3 && !n.nodeValue.trim() && !p) continue;
        if (!p) { p = document.createElement("p"); fixed.appendChild(p); }
        p.appendChild(n);
      }
    }
    // drop empty paragraphs except a single one
    [...fixed.querySelectorAll("p")].forEach((x) => { if (!x.textContent.trim() && !x.querySelector("cite") && fixed.children.length > 1) x.remove(); });
    return fixed.innerHTML || "<p></p>";
  }
  return out.innerHTML;
}

// fill citation chips with readable labels for display in the editor
export function decorate(el) {
  for (const c of el.querySelectorAll("cite")) {
    c.setAttribute("contenteditable", "false");
    c.textContent = chipLabel(c.getAttribute("data-keys"), c.getAttribute("data-form"), c.getAttribute("data-page"));
    c.title = "Klicken zum Bearbeiten";
  }
}
export function chipLabel(keys, form, page) {
  const ks = String(keys || "").split(",").filter(Boolean);
  const c = state.citer;
  if (!c) return ks.join("; ");
  const pg = page ? `, S. ${page}` : "";
  if (form === "t") return ks.map((k) => c.label(k, "t")).join("; ").replace(/\)$/, pg + ")");
  const inner = ks.map((k) => c.label(k, "p").slice(1, -1)).join("; ");
  return `(${inner}${pg})`;
}

// ------------------------------------------------------------ editor element
export function richText({ html, onChange, placeholder = "", lang = "de", className = "" }) {
  const el = document.createElement("div");
  el.className = "rt " + className;
  el.contentEditable = "true";
  el.lang = lang;
  el.spellcheck = true;
  el.dataset.placeholder = placeholder;
  el.innerHTML = html || "<p></p>";
  decorate(el);
  const emit = () => onChange && onChange(cleanHtml(el.innerHTML));
  el.addEventListener("input", () => { emit(); checkTrigger(el); });
  el.addEventListener("keydown", (e) => onKey(e, el));
  el.addEventListener("blur", () => setTimeout(() => { if (!popup || !popup.contains(document.activeElement)) closePopup(); }, 150));
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    const paras = text.split(/\n\s*\n/).map((p) => esc(p.trim()).replace(/\n/g, "<br>")).filter(Boolean);
    const htmlIns = paras.length > 1 ? paras.map((p) => `<p>${p}</p>`).join("") : (paras[0] || "");
    document.execCommand("insertHTML", false, textCitationsToMarkup(htmlIns));
    decorate(el); emit();
  });
  el.addEventListener("click", (e) => {
    const c = e.target.closest("cite");
    if (c && el.contains(c)) openChipEditor(c, el, emit);
  });
  el._emit = emit;
  return el;
}

// toolbar commands on the focused editor
export function command(cmd) {
  const el = document.activeElement && document.activeElement.closest && document.activeElement.closest(".rt");
  if (!el) return false;
  if (cmd === "link") {
    const sel = window.getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    ask("Adresse des Links (https://…):", { input: "https://" }).then((url) => {
      el.focus();
      if (range) { sel.removeAllRanges(); sel.addRange(range); }
      if (url && /^(https?:|mailto:)/.test(url)) document.execCommand("createLink", false, url);
      el._emit && el._emit();
    });
    return true;
  } else if (cmd === "cite") {
    document.execCommand("insertText", false, "@");
    checkTrigger(el);
  } else document.execCommand(cmd, false, null);
  el._emit && el._emit();
  return true;
}

// ------------------------------------------------------------ suggestions
let popup = null, popState = null;

function caretInfo() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  if (node.nodeType !== 3) return null;
  return { node, offset: r.startOffset, before: node.nodeValue.slice(0, r.startOffset), range: r };
}

function checkTrigger(el) {
  const ci = caretInfo();
  if (!ci || !el.contains(ci.node)) return closePopup();
  let m = /(?:^|[\s(\[ ])@([\w:.\-]*)$/.exec(ci.before);
  let kind = "at", q;
  if (m) q = m[1];
  else if ((m = /\\cite([pt]?)\{([\w:.\-]*)$/.exec(ci.before))) { kind = "cite" + m[1]; q = m[2]; }
  else return closePopup();
  const start = ci.before.length - (kind === "at" ? q.length + 1 : m[0].length);
  popState = { el, node: ci.node, start, end: ci.offset, q, kind, sel: 0,
               form: kind === "citet" ? "t" : "p", page: popState && popState.el === el ? popState.page : "" };
  showPopup(ci.range);
}

function results() {
  return state.citer ? state.citer.search(popState.q, 8) : [];
}

function showPopup(range) {
  const list = results();
  if (!popup) {
    popup = document.createElement("div");
    popup.className = "cite-pop";
    popup.setAttribute("role", "listbox");
    document.body.appendChild(popup);
    popup.addEventListener("mousedown", (e) => e.preventDefault());
    popup.addEventListener("click", (e) => {
      const o = e.target.closest("[data-k]");
      if (o) return insertCite(o.dataset.k);
      const f = e.target.closest("[data-form]");
      if (f) { popState.form = f.dataset.form; render(); }
    });
    popup.addEventListener("input", (e) => { if (e.target.name === "page") popState.page = e.target.value; });
  }
  const render = () => {
    const ks = results();
    popState.sel = Math.min(popState.sel, Math.max(0, ks.length - 1));
    const used = new Set();
    popup.innerHTML = (ks.length ? ks.map((k, i) => {
      const e = state.citer.entries.get(k);
      const f = e.fields;
      return `<div role="option" class="cite-opt${i === popState.sel ? " is-sel" : ""}" aria-selected="${i === popState.sel}" data-k="${esc(k)}">
        <b>${esc(state.citer.label(k, "t"))}</b> · ${esc((f.title || "").slice(0, 70))}
        <span class="cite-key">${esc(k)}</span></div>`;
    }).join("") : `<div class="cite-empty">Keine Quelle gefunden für «${esc(popState.q)}». Quellen hinzufügen unter «Quellen».</div>`) +
    `<div class="cite-foot"><span>Form:</span>
      <button type="button" data-form="p" class="${popState.form === "p" ? "is-on" : ""}">(Autor, Jahr)</button>
      <button type="button" data-form="t" class="${popState.form === "t" ? "is-on" : ""}">Autor (Jahr)</button>
      <label>S. <input name="page" value="${esc(popState.page || "")}" size="4" aria-label="Seite"></label></div>`;
  };
  popState.render = render;
  render();
  const rect = range.getBoundingClientRect();
  const top = (rect.bottom || rect.top) + window.scrollY + 6;
  popup.style.top = top + "px";
  popup.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 440) + "px";
  popup.hidden = false;
  if (!list.length && popState.q.length > 20) closePopup();
}

export function closePopup() { if (popup) popup.hidden = true; popState = null; }

function onKey(e, el) {
  if (!popState || popup.hidden || popState.el !== el) return;
  const n = results().length;
  if (e.key === "ArrowDown") { e.preventDefault(); popState.sel = (popState.sel + 1) % Math.max(1, n); popState.render(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); popState.sel = (popState.sel - 1 + n) % Math.max(1, n); popState.render(); }
  else if ((e.key === "Enter" || e.key === "Tab") && n) { e.preventDefault(); insertCite(results()[popState.sel]); }
  else if (e.key === "Escape") { e.preventDefault(); closePopup(); }
}

function insertCite(key) {
  const { el, node, start, end, form, page } = popState;
  const r = document.createRange();
  r.setStart(node, start); r.setEnd(node, Math.min(end, node.nodeValue.length));
  // extend over a closing "}" of \cite{…}
  r.deleteContents();
  // merge with a citation directly before
  let prev = node.previousSibling;
  const textBefore = node.nodeValue.slice(0, start);
  if (prev && prev.nodeName === "CITE" && !textBefore.trim()) {
    const ks = prev.getAttribute("data-keys").split(",");
    if (!ks.includes(key)) ks.push(key);
    prev.setAttribute("data-keys", ks.join(","));
    decorate(el);
    placeCaretAfter(prev);
  } else {
    const c = document.createElement("cite");
    c.setAttribute("data-keys", key);
    c.setAttribute("data-form", form);
    if (page) c.setAttribute("data-page", page);
    const space = document.createTextNode(" ");
    r.insertNode(space);
    r.insertNode(c);
    decorate(el);
    placeCaretAfter(space);
  }
  closePopup();
  el._emit && el._emit();
}
function placeCaretAfter(node) {
  const sel = window.getSelection();
  const r = document.createRange();
  r.setStartAfter(node); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}

// click on a citation chip: change form/page, remove sources
function openChipEditor(c, el, emit) {
  closePopup();
  const pop = document.createElement("div");
  pop.className = "cite-pop chip-pop";
  const keys = c.getAttribute("data-keys").split(",");
  const form = c.getAttribute("data-form");
  pop.innerHTML = `<div class="chip-keys">${keys.map((k) => `<span class="chip">${esc(state.citer ? state.citer.label(k, "t") : k)} <button type="button" data-rm="${esc(k)}" aria-label="Quelle entfernen">×</button></span>`).join("")}</div>
    <div class="cite-foot"><span>Form:</span>
      <button type="button" data-form="p" class="${form !== "t" ? "is-on" : ""}">(Autor, Jahr)</button>
      <button type="button" data-form="t" class="${form === "t" ? "is-on" : ""}">Autor (Jahr)</button>
      <label>S. <input name="page" value="${esc(c.getAttribute("data-page") || "")}" size="4" aria-label="Seite"></label></div>
    <div class="cite-foot"><button type="button" data-del>Zitierung löschen</button><button type="button" data-ok class="btn-primary">Fertig</button></div>`;
  document.body.appendChild(pop);
  const rect = c.getBoundingClientRect();
  pop.style.top = rect.bottom + window.scrollY + 6 + "px";
  pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 440) + "px";
  const close = () => { pop.remove(); document.removeEventListener("mousedown", outside, true); };
  const outside = (e) => { if (!pop.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener("mousedown", outside, true));
  pop.addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.rm) {
      const ks = c.getAttribute("data-keys").split(",").filter((k) => k !== t.dataset.rm);
      if (!ks.length) { c.remove(); close(); } else { c.setAttribute("data-keys", ks.join(",")); t.parentElement.remove(); }
    } else if (t.dataset.form) {
      c.setAttribute("data-form", t.dataset.form);
      pop.querySelectorAll("[data-form]").forEach((b) => b.classList.toggle("is-on", b === t));
    } else if (t.hasAttribute("data-del")) { c.remove(); close(); }
    else if (t.hasAttribute("data-ok")) close();
    decorate(el); emit();
  });
  pop.addEventListener("input", (e) => {
    if (e.target.name === "page") { if (e.target.value) c.setAttribute("data-page", e.target.value); else c.removeAttribute("data-page"); decorate(el); emit(); }
  });
}
