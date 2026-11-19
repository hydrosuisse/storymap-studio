// translate.js — side by side: original | translation, with status per text
import { state, markDirty, emit } from "../state.js";
import { tget, tset, tstatus, ORIG, translatables } from "../model.js";
import { richText, decorate } from "../richtext.js";
import { statusChip, refreshCitations } from "./common.js";
import { esc, hash, stripTags } from "../lib/util.js";
import { h } from "../forms.js";

let filter = "open", target = null, limit = 60;

export function renderTranslate(root) {
  refreshCitations();
  const story = state.story;
  const langs = story.settings.languages.map((l) => l.code);
  if (!target || !langs.includes(target) || target === ORIG(story)) target = langs.find((l) => l !== ORIG(story)) || langs[0];
  const all = translatables(story).filter((x) => x.origLang !== target);
  const st = (x) => tstatus(x.obj, target, x.origLang);
  const n = { all: all.length, ok: all.filter((x) => st(x) === "ok").length, missing: all.filter((x) => st(x) === "missing").length, outdated: all.filter((x) => st(x) === "outdated").length };
  const pct = all.length ? Math.round((n.ok / all.length) * 100) : 100;
  const shown = all.filter((x) => filter === "all" || (filter === "open" && st(x) !== "ok") || (filter === "outdated" && st(x) === "outdated"));
  const native = translatables(story).filter((x) => x.origLang === target);
  root.innerHTML = `
  <div class="page tr-page">
    <div class="tr-head">
      <div><h1>Übersetzung</h1>
        <div class="f-row"><label>Fassung <select id="target">${langs.filter((l) => l !== ORIG(story)).map((l) => `<option value="${l}" ${l === target ? "selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select></label>
        <span class="progress" aria-label="${pct} % übersetzt"><span style="width:${pct}%"></span></span><span class="small">${pct} % · ${n.ok} von ${n.all} Textstellen</span></div></div>
      <div class="seg" role="group" aria-label="Filter">
        <button data-f="all" class="${filter === "all" ? "is-on" : ""}">Alle (${n.all})</button>
        <button data-f="open" class="${filter === "open" ? "is-on" : ""}">Offen (${n.missing + n.outdated})</button>
        <button data-f="outdated" class="${filter === "outdated" ? "is-on" : ""}">Veraltet (${n.outdated})</button>
      </div>
    </div>
    <div class="tr-grid">
      <div class="tr-list" id="trlist"></div>
      <aside class="card typo-card">
        <h2>Typografie ${target === "fr" ? "Français (Suisse)" : target.toUpperCase()}</h2>
        <p class="small">Wird beim Veröffentlichen automatisch angewendet. Autor:innen tippen normale Zeichen.</p>
        ${target === "fr" ? `
        <table class="typo-table"><thead><tr><th>Regel</th><th>Getippt</th><th>Ergebnis</th></tr></thead><tbody>
          <tr><td>Guillemets mit schmalem Leerzeichen</td><td><code>"texte"</code></td><td lang="fr">«&#8239;texte&#8239;»</td></tr>
          <tr><td>Vor ? ! ; schmales Leerzeichen</td><td><code>en été?</code></td><td lang="fr">en été&#8239;?</td></tr>
          <tr><td>Vor : geschütztes Leerzeichen</td><td><code>Source:</code></td><td lang="fr">Source&#160;:</td></tr>
          <tr><td>Prozent</td><td><code>95%</code></td><td lang="fr">95&#8239;%</td></tr>
          <tr><td>Bis-Strich</td><td><code>2015-2026</code></td><td>2015–2026</td></tr>
          <tr><td>Apostroph</td><td><code>l'eau</code></td><td lang="fr">l’eau</td></tr>
          <tr><td>Dezimalzeichen</td><td><code>2.2</code></td><td lang="fr">${story.settings.decimalCommaFr ? "2,2" : "2.2"}</td></tr>
        </tbody></table>
        <label class="f f-inline"><input type="checkbox" id="deccomma" ${story.settings.decimalCommaFr ? "checked" : ""}> Dezimalkomma in der französischen Fassung</label>` : `<p>«Text», 95&#160;%, 2015–2026.</p>`}
        <p class="small muted">Zitierungen und das Quellenverzeichnis werden nicht übersetzt; die APA-Wörter richten sich nach der Sprache jedes Eintrags.</p>
        ${native.length ? `<p class="small">${native.length} Textstelle(n) wurden ursprünglich auf ${target.toUpperCase()} geschrieben – sie erscheinen in der Fassung ${ORIG(story).toUpperCase()} zur Übersetzung.</p>` : ""}
      </aside>
    </div>
  </div>`;
  root.querySelector("#target").onchange = (e) => { target = e.target.value; renderTranslate(root); };
  root.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filter = b.dataset.f; limit = 60; renderTranslate(root); }));
  const dc = root.querySelector("#deccomma");
  if (dc) dc.onchange = () => { story.settings.decimalCommaFr = dc.checked; markDirty(); renderTranslate(root); };
  const list = root.querySelector("#trlist");
  if (!shown.length) list.innerHTML = `<p class="card">Alles übersetzt. 🎉</p>`.replace(" 🎉", "");
  for (const x of shown.slice(0, limit)) list.appendChild(rowEl(x, st(x), root));
  if (shown.length > limit) list.appendChild(h("button", { class: "btn", onclick: () => { limit += 60; renderTranslate(root); } }, `Weitere ${shown.length - limit} anzeigen`));
}

function rowEl(x, status, root) {
  const o = x.obj, src = x.origLang;
  const left = h("div", { class: "tr-src", lang: src });
  left.innerHTML = x.kind === "html" ? (o[src] || "") : esc(o[src] || "");
  if (x.kind === "html") decorate(left);
  left.querySelectorAll("cite").forEach((c) => c.removeAttribute("contenteditable"));
  let right;
  const onEdit = (v) => { tset(o, target, v, src); markDirty(); chip.innerHTML = statusChip(tstatus(o, target, src)); };
  if (x.kind === "html") right = richText({ html: o[target] || "", lang: target, className: "rt-small", placeholder: "Übersetzung …", onChange: onEdit });
  else {
    right = h("input", { value: o[target] || "", lang: target, placeholder: "Übersetzung …", "aria-label": "Übersetzung" });
    right.addEventListener("input", () => onEdit(right.value));
  }
  const chip = h("span", { html: statusChip(status) });
  const copy = h("button", { class: "btn btn-small", type: "button" }, "Original als Vorlage kopieren");
  copy.title = "Übernimmt den Originaltext samt Zitierungen, damit nur noch übersetzt werden muss.";
  copy.onclick = () => { o[target] = o[src]; o._h = o._h || {}; o._h[target] = "_copy"; markDirty(); renderTranslate(root); };
  const confirmBtn = status === "outdated" ? h("button", { class: "btn btn-small btn-ok", type: "button", onclick: () => {
    o._h = o._h || {}; o._h[target] = hash(o[src] || ""); markDirty(); renderTranslate(root);
  } }, "Als aktuell bestätigen") : null;
  return h("section", { class: "tr-row card tr-" + status },
    h("div", { class: "tr-meta" }, h("span", { class: "muted small" }, x.label + (src !== ORIG(state.story) ? ` · Original ${src.toUpperCase()}` : "")), chip),
    h("div", { class: "tr-cols" }, left, right),
    h("div", { class: "f-row" }, copy, confirmBtn));
}
