// publish.js — checks, address (domain, …/de/, …/fr/), publish, build status, versions
import { state, emit, markDirty, save, publish, siteUrl, STORY_PATH, BIB_PATH, rebuildCiter } from "../state.js";
import { checks, ORIG } from "../model.js";
import { refreshCitations } from "./common.js";
import { esc, icon, toast, modal, ask } from "../lib/util.js";
import { h } from "../forms.js";

export function renderPublish(root) {
  refreshCitations();
  const story = state.story, s = story.settings;
  const langs = s.languages.map((l) => l.code);
  const list = checks(story, state.citer, langs);
  const errorsByLang = {};
  list.filter((c) => c.level === "error" && c.lang).forEach((c) => (errorsByLang[c.lang] = true));
  const gh = state.mode === "github";
  root.innerHTML = `
  <div class="page page-3">
    <section class="card">
      <h2>Prüfung vor dem Veröffentlichen</h2>
      ${list.length ? list.map((c) => `
        <div class="check-item check-${c.level}">
          <span class="check-dot" aria-hidden="true">!</span>
          <span>${esc(c.text)}</span>
          <button class="link-btn" data-view="${c.view}" ${c.ref ? `data-ref="${c.ref}"` : ""}>Öffnen</button>
        </div>`).join("") : `<p class="ok">${icon("check", 16)} Keine offenen Punkte.</p>`}
      <ul class="plain oklist">
        <li>${icon("check", 14)} Zitierungen: ${state.citer.usedOrder.length} Quellen im Verzeichnis (APA 6)</li>
        <li>${icon("check", 14)} Typografie wird beim Build angewendet (de-CH, fr-CH)</li>
        <li>${icon("check", 14)} Bild- und Tabellennachweise werden aus den Bausteinen erzeugt</li>
      </ul>
    </section>

    <section class="card">
      <h2>Adresse (URL)</h2>
      <fieldset class="f">
        <legend class="f-label">Domain</legend>
        <label class="radio-card ${!s.domain ? "is-on" : ""}"><input type="radio" name="dom" value="gh" ${!s.domain ? "checked" : ""}> GitHub-Adresse <span class="muted">${esc(state.owner)}.github.io</span></label>
        <label class="radio-card ${s.domain ? "is-on" : ""}"><input type="radio" name="dom" value="own" ${s.domain ? "checked" : ""}> Eigene Domain
          <input id="domain" value="${esc(s.domain || "")}" placeholder="z. B. storymaps.ihre-domain.ch" aria-label="Eigene Domain"></label>
      </fieldset>
      <label class="f">Pfad der Story
        <span class="path-input"><span class="muted">${esc(s.domain ? s.domain.replace(/^https?:\/\//, "") : state.owner + ".github.io")}/</span>
        <input id="basepath" value="${esc(s.basePath || "")}" placeholder="${esc(state.repo)}"><span class="muted">/</span></span></label>
      <p class="f-help">${s.domain ? "Bei eigener Domain kann der Pfad leer bleiben." : "Bei der GitHub-Adresse ist der Pfad der Name des Repositorys (" + esc(state.repo) + ")."}</p>
      <div class="f"><span class="f-label">Sprachkürzel in der Adresse</span>
        ${s.languages.map((l, i) => `<div class="f-row lang-path"><span>${esc(l.label)}</span><span class="path-input"><span class="muted">/</span><input data-li="${i}" value="${esc(l.path)}" aria-label="Kürzel ${esc(l.label)}"><span class="muted">/</span></span></div>`).join("")}
      </div>
      <label class="f">Adresse ohne Kürzel
        <select id="root">
          <option value="browser" ${s.rootRedirect === "browser" ? "selected" : ""}>Browsersprache, sonst /${esc(s.languages[0].path)}/</option>
          ${s.languages.map((l) => `<option value="${l.code}" ${s.rootRedirect === l.code ? "selected" : ""}>immer /${esc(l.path)}/</option>`).join("")}
        </select></label>
      <div class="url-box"><div class="muted small">Ergibt</div>
        ${s.languages.map((l) => `<div><b>${l.code.toUpperCase()}</b> <a href="${esc(siteUrl(l.code))}" target="_blank" rel="noopener">${esc(siteUrl(l.code))}</a></div>`).join("")}
        <div class="muted">→ ${esc(siteUrl())} leitet weiter</div></div>
      <p class="f-help">Bisherige Links bleiben gültig und leiten auf die richtige Sprache weiter. Der Sprachumschalter in der Story führt zum gleichen Kapitel in der anderen Sprache.
        ${s.domain ? "Eigene Domain: einmalig einen CNAME-Eintrag auf " + esc(state.owner) + ".github.io setzen und in GitHub unter Settings → Pages die Domain eintragen; das Studio legt die Datei CNAME beim Build an." : ""}</p>
    </section>

    <section class="pub-col">
      <div class="card">
        <h2>Veröffentlichen</h2>
        ${gh ? `
        <fieldset class="f"><legend class="f-label">Sprachen</legend>
          ${s.languages.map((l) => `<label class="radio-card ${errorsByLang[l.code] ? "" : "is-on"}"><input type="checkbox" checked disabled> ${esc(l.label)}
            <span class="muted small">${errorsByLang[l.code] ? "noch nicht vollständig übersetzt – fehlende Stellen erscheinen in der Originalsprache" : esc(siteUrl(l.code))}</span></label>`).join("")}
        </fieldset>
        <label class="f">Was wurde geändert? <span class="muted">(für die Versionsgeschichte)</span><input id="msg" placeholder="z. B. Tabelle 1 ergänzt"></label>
        <div class="f-row f-wrap">
          <button class="btn btn-primary" id="pub">Veröffentlichen</button>
          <button class="btn" id="draft">Nur Entwurf speichern</button>
        </div>
        <p class="f-help">Veröffentlichen übernimmt den Entwurf (Branch <code>${esc(state.branch)}</code>) nach <code>${esc(state.main)}</code>. GitHub baut die Seite in 2–3 Minuten neu; die Grafiken werden weiterhin jeden Morgen aktualisiert.
          Jedes Speichern des Entwurfs baut ausserdem eine Vorschau-Seite, wenn diese im Repository eingerichtet ist (siehe README).</p>
        <p class="f-help">Vorschau-Seite (falls eingerichtet): <a href="https://${esc(state.owner)}.github.io/${esc(state.repo)}-vorschau/" target="_blank" rel="noopener">${esc(state.owner)}.github.io/${esc(state.repo)}-vorschau/</a></p>
        <div id="runs" class="runs"></div>` : `
        <p>Im Demo-Modus wird nichts veröffentlicht. Mit «Inhalte herunterladen» (Zahnrad oben rechts) können <code>story.json</code> und <code>quellen.bib</code> gesichert werden.</p>`}
      </div>
      ${gh ? `<div class="card"><h2>Versionen</h2><div id="versions" class="muted">Lade …</div></div>` : ""}
    </section>
  </div>`;

  root.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => {
    state.view = b.dataset.view;
    if (b.dataset.ref) {
      for (const ch of story.chapters) if (ch.blocks.some((x) => x.id === b.dataset.ref)) { state.chapterId = ch.id; state.blockId = b.dataset.ref; }
    }
    emit("view");
  }));
  root.querySelectorAll("input[name=dom]").forEach((r) => (r.onchange = () => { if (r.value === "gh") s.domain = ""; else s.domain = root.querySelector("#domain").value || "storymaps.example.ch"; markDirty(); renderPublish(root); }));
  root.querySelector("#domain").onchange = (e) => { s.domain = e.target.value.trim(); markDirty(); renderPublish(root); };
  root.querySelector("#basepath").onchange = (e) => { s.basePath = e.target.value.trim().replace(/^\/|\/$/g, ""); markDirty(); renderPublish(root); };
  root.querySelectorAll("[data-li]").forEach((i) => (i.onchange = () => {
    const v = i.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!v) return;
    s.languages[+i.dataset.li].path = v; markDirty(); renderPublish(root);
  }));
  root.querySelector("#root").onchange = (e) => { s.rootRedirect = e.target.value; markDirty(); };

  if (!gh) return;
  root.querySelector("#draft").onclick = async () => {
    try { await save(root.querySelector("#msg").value || "Entwurf gespeichert"); toast("Entwurf gespeichert.", "ok"); renderPublish(root); }
    catch (e) { toast("Speichern fehlgeschlagen: " + e.message, "error", 8000); }
  };
  root.querySelector("#pub").onclick = async () => {
    const errs = list.filter((c) => c.level === "error" && !c.lang);
    if (errs.length && !(await ask(`Es gibt ${errs.length} offene Fehler (z. B. «${errs[0].text}»). Trotzdem veröffentlichen?`, { ok: "Trotzdem veröffentlichen" }))) return;
    const msg = root.querySelector("#msg").value || "Storymap veröffentlicht";
    const btn = root.querySelector("#pub"); btn.disabled = true; btn.textContent = "Veröffentliche …";
    try {
      const r = await publish(msg);
      toast(r ? "Veröffentlicht – die Seite ist in 2–3 Minuten online." : "Alles war bereits veröffentlicht.", "ok", 7000);
      setTimeout(() => showRuns(root), 4000);
    } catch (e) {
      toast(e.status === 409 ? "Veröffentlichen nicht möglich: auf main gibt es Änderungen, die mit dem Entwurf kollidieren. Bitte im Repository zusammenführen." : "Fehler: " + e.message, "error", 10000);
    } finally { btn.disabled = false; btn.textContent = "Veröffentlichen"; }
  };
  showRuns(root);
  showVersions(root);
}

async function showRuns(root) {
  const el = root.querySelector("#runs"); if (!el) return;
  const [pubRun, draftRun] = await Promise.all([state.gh.latestRun(state.main), state.gh.latestRun(state.branch)]);
  const fmt = (r, what) => !r ? "" : `<div class="run run-${r.conclusion || r.status}"><b>${what}:</b> ${
    r.status !== "completed" ? "Build läuft …" : r.conclusion === "success" ? "erfolgreich" : "fehlgeschlagen"} ·
    ${new Date(r.updated_at).toLocaleString("de-CH")} · <a href="${esc(r.html_url)}" target="_blank" rel="noopener">Details</a></div>`;
  el.innerHTML = fmt(pubRun, "Letzter Build (veröffentlicht)") + fmt(draftRun, "Letzter Build (Entwurf/Vorschau)");
}

async function showVersions(root) {
  const el = root.querySelector("#versions"); if (!el) return;
  try {
    const cs = await state.gh.commits(state.main, STORY_PATH, 10);
    el.classList.remove("muted");
    el.innerHTML = cs.length ? `<ol class="versions">${cs.map((c, i) => `
      <li><span><b>${i === 0 ? "Online · " : ""}${new Date(c.commit.author.date).toLocaleString("de-CH")}</b><br>
        <span class="muted small">${esc(c.commit.message.split("\n")[0])} · ${esc(c.commit.author.name)}</span></span>
        ${i ? `<button class="btn btn-small" data-sha="${c.sha}">Als Entwurf laden</button>` : `<span class="ok small">aktuell</span>`}</li>`).join("")}</ol>`
      : "Noch keine veröffentlichte Version.";
    el.onclick = async (e) => {
      const sha = e.target.dataset.sha; if (!sha) return;
      if (!(await ask("Diese Version als Entwurf laden? Der aktuelle Entwurf wird ersetzt (bleibt aber in der Versionsgeschichte).", { ok: "Laden" }))) return;
      const [st, bib] = await Promise.all([state.gh.readText(STORY_PATH, sha), state.gh.readText(BIB_PATH, sha)]);
      state.story = JSON.parse(st); state.bib = bib || ""; rebuildCiter(); markDirty();
      toast("Version geladen – mit «Speichern» als Entwurf sichern, mit «Veröffentlichen» wiederherstellen.", "ok", 8000);
      emit("all");
    };
  } catch (e) { el.textContent = "Versionen konnten nicht geladen werden: " + e.message; }
}
