// nachweise.js — image/video and table credits: suggestions from the blocks, editable
import { state, emit, markDirty, mediaUrl } from "../state.js";
import { tget, tset, ORIG, nachweisRows, allTables } from "../model.js";
import { refreshCitations, statusChip } from "./common.js";
import { esc, icon, ask } from "../lib/util.js";

export function renderNachweise(root) {
  refreshCitations();
  const story = state.story, lang = state.lang, orig = ORIG(story);
  story.nachweise = story.nachweise || { overrides: {} };
  const ov = story.nachweise.overrides;
  const rows = nachweisRows(story, lang);
  const tables = allTables(story);
  const c = state.citer;
  root.innerHTML = `
  <div class="page page-2">
    <main>
      <div class="legend-row">
        ${statusChip("suggested")} direkt aus dem Baustein übernommen · ${statusChip("custom")} hier geändert · <span class="chip chip-warn">Angabe fehlt</span> im Baustein nicht ausgefüllt
      </div>
      <section class="card">
        <div class="card-h"><h2>Bild- und Videonachweise <span class="muted">· ${rows.length} Zeilen</span></h2>
          <button class="btn btn-small" id="reset-all">Alle Vorschläge neu übernehmen</button></div>
        <div class="nw-table" role="table" aria-label="Bildnachweise">
          <div role="row" class="nw-row nw-head"><span>Bild</span><span>Beschreibung</span><span>Urheber/in (Jahr) · Lizenz</span><span>Status</span></div>
          ${rows.map((r, i) => `
          <div role="row" class="nw-row${r.status === "missing" ? " nw-missing" : ""}" data-id="${r.id}">
            <span class="nw-thumb">${r.entry.item.src || r.entry.item.image ? `<img alt="" data-src="${esc(r.entry.item.src || r.entry.item.image)}">` : icon(r.entry.kind === "video" ? "video" : "image", 22)}</span>
            <input data-f="label" value="${esc(r.label)}" aria-label="Beschreibung" placeholder="${esc(r.sugLabel)}">
            <input data-f="credit" value="${esc(r.credit)}" aria-label="Nachweis" placeholder="Urheber/in (Jahr)">
            <span class="nw-status">${r.status === "missing" ? `<span class="chip chip-warn">${esc(r.missing)}</span>` : statusChip(r.status)}
              ${r.status === "custom" ? `<button class="link-btn" data-act="reset">Vorschlag wiederherstellen</button>` : ""}
              <button class="link-btn" data-act="goto">Zum Baustein</button>
              ${i > 0 ? `<label class="small"><input type="checkbox" data-act="merge" ${r.mergedIds.length ? "" : ""}> mit vorheriger zusammenfassen</label>` : ""}</span>
          </div>
          ${r.mergedIds.length ? `<div class="nw-note">+ ${r.mergedIds.length} weitere(s) Bild(er) in dieser Zeile zusammengefasst <button class="link-btn" data-unmerge="${r.mergedIds.join(",")}">trennen</button></div>` : ""}
          <div class="nw-note">Vorschlag: «${esc(r.sugLabel)}» – ${esc(r.sugCredit || "Urheber/in fehlt")} · ${esc(r.entry.where)}</div>`).join("")}
        </div>
      </section>
      <section class="card">
        <h2>Tabellennachweise <span class="muted">· ${tables.length}</span></h2>
        ${tables.length ? tables.map((t) => `
          <div class="nw-row nw-row-t">
            <b>Tabelle ${t.n}</b>
            <span>${esc(tget(t.item.title, lang, orig) || "ohne Titel")}</span>
            <span>${t.item.sources.length ? c.sourceLine(t.item.sources, lang, (lang === "fr" ? "Données : " : "Daten: ")) : `<span class="warn">Keine Datenquelle angegeben</span>`}</span>
            <button class="link-btn" data-goto="${t.id}">Zum Baustein</button>
          </div>`).join("") : `<p class="muted">Keine Tabellen in der Story.</p>`}
        <p class="f-help">Nummer und Titel kommen aus dem Tabellen-Baustein, die Datenquelle aus dessen Quellen-Feld (erscheint damit auch im Quellenverzeichnis).</p>
      </section>
    </main>
    <aside class="card preview-nw" lang="${lang}">
      <div class="muted small upper">So erscheint es in der Story (${lang.toUpperCase()})</div>
      <h3>${lang === "fr" ? "Crédits photographiques" : "Bildnachweise"}</h3>
      <table class="sm-credits-prev">${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.credit || "–")}</td></tr>`).join("")}</table>
      ${tables.length ? `<h3>${lang === "fr" ? "Sources des tableaux" : "Tabellennachweise"}</h3>
      <table class="sm-credits-prev">${tables.map((t) => `<tr><td>${lang === "fr" ? "Tableau" : "Tabelle"} ${t.n}: ${esc(tget(t.item.title, lang, orig))}</td><td>${t.item.sources.length ? c.sourceLine(t.item.sources, lang, lang === "fr" ? "Données : " : "Daten: ") : "–"}</td></tr>`).join("")}</table>` : ""}
    </aside>
  </div>`;
  root.querySelectorAll("img[data-src]").forEach(async (img) => (img.src = await mediaUrl(img.dataset.src)));
  root.querySelector(".nw-table").addEventListener("input", (e) => {
    const row = e.target.closest("[data-id]"); if (!row || !e.target.dataset.f) return;
    const o = (ov[row.dataset.id] = ov[row.dataset.id] || {});
    if (e.target.dataset.f === "label") { o.label = o.label || {}; tset(o.label, lang, e.target.value, orig); }
    else o.credit = e.target.value;
    markDirty();
  });
  root.querySelector(".nw-table").addEventListener("change", (e) => { if (e.target.dataset.f) renderNachweise(root); });
  root.onclick = (e) => {
    const t = e.target;
    const row = t.closest("[data-id]");
    if (t.dataset.act === "reset" && row) { delete ov[row.dataset.id]; markDirty(); renderNachweise(root); }
    if (t.dataset.act === "merge" && row) { (ov[row.dataset.id] = ov[row.dataset.id] || {}).mergeWithPrevious = true; markDirty(); renderNachweise(root); }
    if (t.dataset.unmerge) { t.dataset.unmerge.split(",").forEach((id) => ov[id] && delete ov[id].mergeWithPrevious); markDirty(); renderNachweise(root); }
    if (t.dataset.act === "goto" && row) goto(row.dataset.id);
    if (t.dataset.goto) goto(t.dataset.goto);
    if (t.id === "reset-all") ask("Alle hier geänderten Nachweise auf die Vorschläge aus den Bausteinen zurücksetzen?", { ok: "Zurücksetzen" })
      .then((y) => { if (y) { story.nachweise.overrides = {}; markDirty(); renderNachweise(root); } });
  };
}

function goto(id) {
  const story = state.story;
  if (id === "cover") { state.chapterId = "__cover"; state.view = "write"; return emit("view"); }
  for (const ch of story.chapters) for (const b of ch.blocks) {
    if (b.id === id) { state.chapterId = ch.id; state.blockId = b.id; state.view = "write"; return emit("view"); }
    if (b.type === "tour") for (const s of b.slides) if ((s.images || []).some((im) => im.id === id)) {
      state.chapterId = ch.id; state.tourBlockId = b.id; state.slideId = s.id; state.view = "tour"; return emit("view");
    }
  }
}
