// quellen.js — BibTeX library: load, filter cited/all, add entries, preview the reference list
import { state, setBib, emit } from "../state.js";
import { ORIG, citedKeys } from "../model.js";
import { entryLang, TERMS, parseBib } from "../lib/cite.js";
import { refreshCitations } from "./common.js";
import { esc, icon, fileToText, modal, toast, tell } from "../lib/util.js";

let show = "cited", q = "", previewLang = null;

export function renderQuellen(root) {
  refreshCitations();
  const story = state.story, c = state.citer;
  const cited = citedKeys(story);
  const count = new Map();
  const bump = (k) => count.set(k, (count.get(k) || 0) + 1);
  const re = /data-keys=\\"([^"\\]+)\\"/g, json = JSON.stringify(story);
  let m; while ((m = re.exec(json))) m[1].split(",").forEach(bump);
  const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "sources" && Array.isArray(v)) v.forEach(bump); else walk(v); } };
  walk(story);
  const keys = [...c.entries.keys()];
  const shown = keys.filter((k) => (show === "all" || cited.includes(k)) && (!q || JSON.stringify(c.entries.get(k).fields).toLowerCase().includes(q.toLowerCase())));
  const missing = cited.filter((k) => !c.entries.get(k));
  previewLang = previewLang || state.lang;
  const refs = c.references(cited.filter((k) => c.entries.get(k)));
  root.innerHTML = `
  <div class="page page-3">
    <section class="card">
      <div class="card-h"><h2>Bibliothek</h2><span class="chip chip-info">Zitierstil: APA 6</span></div>
      <label class="drop" id="drop">
        <span class="drop-icon">${icon("up", 22)}</span>
        <span><b>${keys.length ? `quellen.bib · ${keys.length} Einträge` : "Noch keine Bibliothek"}</b><br>
        <span class="muted">.bib-Datei hier hineinziehen oder wählen (Export aus Zotero, Citavi, JabRef …). Ersetzt oder ergänzt die Bibliothek.</span></span>
        <input type="file" accept=".bib,.bibtex,text/x-bibtex,text/plain" class="visually-hidden" id="bibfile">
      </label>
      <div class="f-row f-wrap">
        <div class="seg" role="group" aria-label="Anzeige">
          <button data-show="cited" class="${show === "cited" ? "is-on" : ""}">Im Text zitiert (${cited.length})</button>
          <button data-show="all" class="${show === "all" ? "is-on" : ""}">Alle geladenen (${keys.length})</button>
        </div>
        <span class="muted small">Nur zitierte Einträge kommen ins Quellenverzeichnis.</span>
      </div>
      ${missing.length ? `<p class="alert alert-error">Im Text zitiert, aber nicht in der Bibliothek: ${missing.map((k) => `<code>${esc(k)}</code>`).join(", ")}</p>` : ""}
      <label class="search">${icon("search", 16)}<input id="q" placeholder="Autor, Titel, Jahr oder Schlüssel …" value="${esc(q)}" aria-label="Quelle suchen"></label>
      <div class="ref-table" role="table" aria-label="Einträge">
        <div role="row" class="ref-row ref-head"><span>Eintrag</span><span>Jahr</span><span>Im Text</span></div>
        ${shown.map((k) => row(k, c, cited, count)).join("") || `<p class="muted">Keine Einträge.</p>`}
      </div>
      <div class="f-row f-wrap"><button class="btn btn-small" id="add">+ Eintrag von Hand</button>
        <button class="btn btn-small" id="edit">BibTeX bearbeiten</button></div>
    </section>

    <section class="card">
      <h2>Zitieren im Text</h2>
      <p>Vorschläge erscheinen beim Tippen von <code>@</code> oder <code>\\cite{</code>; gesucht wird in Autor, Titel, Jahr und Schlüssel. Mit Pfeiltasten wählen, Enter fügt ein.</p>
      <ul class="plain">
        <li><code>@aebi</code> → (Aebi, 2026)</li>
        <li><code>\\citet{bfe_wasta}</code> → BFE (2026e)</li>
        <li><code>\\citep{a,b}</code> oder <code>[@a; @b]</code> → (A, 2026; B, 2025)</li>
      </ul>
      <p>Im Text erscheint ein Chip; ein Klick darauf ändert Form oder Seite oder entfernt die Quelle.</p>
      <h3>Automatisch erledigt</h3>
      <ul class="plain">
        <li>Ins Verzeichnis kommen nur Einträge, die im Text, unter Grafiken, Tabellen oder bei Kartenebenen zitiert sind</li>
        <li>Alphabetisch nach Nachname der ersten Autorin / des ersten Autors (APA 6)</li>
        <li>Gleiche Autor/in und gleiches Jahr: 2026a, 2026b … in der richtigen Reihenfolge</li>
        <li>APA-Wörter («und», «Hrsg.», «o. J.», «Abgerufen am») in der Sprache des Eintrags (BibTeX-Feld <code>langid</code>) – in übersetzten Fassungen unverändert</li>
        <li><code>urldate = {heute}</code> setzt beim Build das aktuelle Abrufdatum</li>
      </ul>
    </section>

    <section class="card">
      <div class="card-h"><h2>Vorschau Verzeichnis</h2>
        <div class="seg" role="group" aria-label="Fassung">${story.settings.languages.map((l) => `<button data-pl="${l.code}" class="${previewLang === l.code ? "is-on" : ""}">${l.code.toUpperCase()}</button>`).join("")}</div></div>
      <h3>${previewLang === "fr" ? "Sources" : previewLang === "en" ? "References" : "Quellen"}</h3>
      <div class="refs">${refs.map((r) => `<p class="ref" lang="${r.lang}">${r.html}</p>`).join("") || `<p class="muted">Noch keine Zitierungen.</p>`}</div>
      <p class="muted small">Die Einträge sind in jeder Fassung gleich: nur die Überschrift folgt der Sprache der Fassung.</p>
    </section>
  </div>`;
  const load = async (file) => {
    const text = await fileToText(file);
    const n = parseBib(text).size;
    if (!n) { toast("In der Datei wurden keine BibTeX-Einträge gefunden.", "error"); return; }
    const d = modal(`<h2>${n} Einträge gefunden</h2><p>Soll die bestehende Bibliothek ersetzt oder ergänzt werden? Beim Ergänzen gewinnen gleichnamige Schlüssel aus der neuen Datei.</p>
      <div class="modal-actions"><button class="btn" value="cancel">Abbrechen</button><button class="btn" value="merge">Ergänzen</button><button class="btn btn-primary" value="replace">Ersetzen</button></div>`);
    d.querySelector(".modal-actions").onclick = (e) => {
      const v = e.target.value; if (!v) return;
      if (v === "replace") setBib(text);
      if (v === "merge") {
        const newKeys = new Set(parseBib(text).keys());
        const kept = state.bib.split(/(?=^@)/m).filter((chunk) => { const m = /^@\w+\s*[{(]\s*([^,\s]+)/.exec(chunk.trim()); return !m || !newKeys.has(m[1]); });
        setBib(kept.join("").trim() + "\n\n" + text);
      }
      d.close(); emit("view");
    };
  };
  root.querySelector("#bibfile").addEventListener("change", (e) => e.target.files[0] && load(e.target.files[0]));
  const drop = root.querySelector("#drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drag"); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  root.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => { show = b.dataset.show; renderQuellen(root); }));
  root.querySelectorAll("[data-pl]").forEach((b) => (b.onclick = () => { previewLang = b.dataset.pl; renderQuellen(root); }));
  const qi = root.querySelector("#q");
  qi.addEventListener("input", () => { q = qi.value; const pos = qi.selectionStart; renderQuellen(root); const n = root.querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelector("#add").onclick = () => addEntry(root);
  root.querySelector("#edit").onclick = () => editBib(root);
}

function row(k, c, cited, count) {
  const e = c.entries.get(k), f = e.fields;
  const lang = entryLang(e, ORIG(state.story));
  const warn = [];
  if (f.url && !f.urldate && !f.year && !f.date) warn.push("ohne Jahr und Abrufdatum");
  if (!f.author && !f.editor) warn.push("ohne Autor/in");
  const n = cited.includes(k) ? `${Math.max(1, count.get(k) || 1)} ×` : `<span class="muted">nicht zitiert · nicht im Verzeichnis</span>`;
  const label = c.label(k, "t");
  return `<div role="row" class="ref-row${warn.length ? " ref-warn" : ""}">
    <span role="cell"><b>${esc(label.replace(/\s*\(.*$/, ""))}</b><br>${esc(f.title || "")}<br>
      <code class="muted">${esc(k)}</code> <span class="chip chip-tiny">${lang.toUpperCase()}</span>${warn.length ? ` <span class="warn small">⚠ ${warn.join(", ")}</span>` : ""}</span>
    <span role="cell">${esc(f.year || (f.date || "").slice(0, 4) || TERMS[lang].nd)}</span>
    <span role="cell">${n}</span></div>`;
}

function addEntry(root) {
  const d = modal(`<h2>Eintrag von Hand</h2>
    <form id="ne" class="form">
      <label class="f">Typ <select name="type"><option value="online">Webseite</option><option value="dataset">Datensatz</option><option value="report">Bericht</option>
        <option value="article">Artikel (Zeitung/Zeitschrift)</option><option value="book">Buch</option><option value="incollection">Buchkapitel</option></select></label>
      <label class="f">Schlüssel (für @…) <input name="key" required pattern="[A-Za-z0-9_:.\\-]+" placeholder="z. B. bfe_wasta"></label>
      <label class="f">Autor/innen <input name="author" placeholder="Nachname, Vorname and Nachname, Vorname · Organisation in {Klammern}"></label>
      <label class="f">Kurzform im Text (Organisationen) <input name="shortauthor" placeholder="z. B. BFE"></label>
      <label class="f">Jahr <input name="year" placeholder="2026 – leer = o. J."></label>
      <label class="f">Titel <input name="title" required></label>
      <label class="f">Erschienen in (Zeitung, Zeitschrift, Blog) <input name="journaltitle"></label>
      <label class="f">Adresse (URL) <input name="url"></label>
      <label class="f f-inline"><input type="checkbox" name="today" checked> Abrufdatum = Datum des Builds</label>
      <label class="f">Sprache des Eintrags <select name="langid"><option value="german">Deutsch</option><option value="french">Französisch</option><option value="english">Englisch</option></select></label>
      <div class="modal-actions"><button type="button" class="btn" value="cancel">Abbrechen</button><button class="btn btn-primary" type="submit">Hinzufügen</button></div>
    </form>`);
  d.querySelector("[value=cancel]").onclick = () => d.close();
  d.querySelector("#ne").onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (state.citer.entries.has(f.key)) { tell("Diesen Schlüssel gibt es schon."); return; }
    const fields = [["author", f.author && (/,|\sand\s/.test(f.author) ? f.author : `{${f.author}}`)], ["shortauthor", f.shortauthor], ["year", f.year],
      ["title", f.title], ["journaltitle", f.journaltitle], ["url", f.url], ["urldate", f.url && f.today ? "heute" : ""], ["langid", f.langid]].filter(([, v]) => v);
    const entry = `@${f.type}{${f.key},\n${fields.map(([k, v]) => `  ${k.padEnd(12)}= {${v}}`).join(",\n")}\n}\n`;
    setBib((state.bib || "").trim() + "\n\n" + entry);
    d.close(); renderQuellen(root);
  };
}

function editBib(root) {
  const d = modal(`<h2>BibTeX bearbeiten</h2><textarea id="bibtext" class="code" rows="24" spellcheck="false" aria-label="BibTeX">${esc(state.bib)}</textarea>
    <div class="modal-actions"><button class="btn" value="cancel">Abbrechen</button><button class="btn btn-primary" value="ok">Übernehmen</button></div>`, { wide: true });
  d.querySelector(".modal-actions").onclick = (e) => {
    if (e.target.value === "ok") { setBib(d.querySelector("#bibtext").value); d.close(); renderQuellen(root); }
    if (e.target.value === "cancel") d.close();
  };
}
