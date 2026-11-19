// app.js — start screen, top bar, view switching.
import { state, onChange, emit, loadDemo, newEmptyDemo, connectGitHub, startNewStoryInRepo, save,
         localDraft, useLocalDraft, dropLocalDraft } from "./state.js";
import { tget, ORIG } from "./model.js";
import { esc, icon, toast, modal, ask, $ } from "./lib/util.js";
import { t, setUiLang, uiLang, UI_LANGS } from "./lib/i18n.js";
import { refreshCitations } from "./views/common.js";
import { renderWrite } from "./views/write.js";
import { renderBausteine } from "./views/bausteine.js";
import { renderTour } from "./views/tour.js";
import { renderQuellen } from "./views/quellen.js";
import { renderNachweise } from "./views/nachweise.js";
import { renderTranslate } from "./views/translate.js";
import { renderPublish } from "./views/publish.js";
import { openPreview } from "./views/preview.js";

const app = document.getElementById("app");
setUiLang(uiLang());

const VIEWS = {
  write: renderWrite, bausteine: renderBausteine, tour: renderTour, quellen: renderQuellen,
  nachweise: renderNachweise, translate: renderTranslate, publish: renderPublish,
};
const TABS = [["write", "write"], ["bausteine", "blocks"], ["quellen", "sources"], ["nachweise", "credits"], ["translate", "translate"], ["publish", "publish"]];

// ------------------------------------------------------------ start screen
function renderStart(err) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("studio-connection") || "{}"); } catch (_) {}
  app.innerHTML = `
  <main class="start">
    <div class="start-brand"><span class="logo">${icon("tour", 22)}</span><h1>Storymap-Studio</h1></div>
    <p class="start-lead">Storymaps schreiben, ohne Code. Inhalte werden im GitHub-Repository der Story gespeichert; GitHub baut daraus die Seite.</p>
    ${err ? `<p class="alert alert-error" role="alert">${esc(err)}</p>` : ""}
    <div class="start-grid">
      <form class="card" id="gh-form">
        <h2>Mit GitHub verbinden</h2>
        <label class="f">Repository (Besitzer/Name)
          <input name="repo" required placeholder="hydrosuisse/wasserkraft-storymap" value="${esc(saved.repo || "")}" autocomplete="off"></label>
        <label class="f">GitHub-Zugangsschlüssel (Token)
          <input name="token" type="password" required placeholder="github_pat_…" value="${esc(saved.token || "")}" autocomplete="off"></label>
        <p class="f-help">Ein «Fine-grained token» mit Zugriff nur auf dieses Repository und der Berechtigung <b>Contents: Read and write</b>.
          Erstellen unter GitHub → Settings → Developer settings → Personal access tokens. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Token erstellen</a></p>
        <label class="f f-inline"><input type="checkbox" name="remember" ${saved.token ? "checked" : ""}> Auf diesem Gerät merken</label>
        <details><summary>Erweitert</summary>
          <label class="f">Entwurfs-Branch <input name="branch" value="${esc(saved.branch || "entwurf")}"></label>
        </details>
        <button class="btn btn-primary btn-block" type="submit">Verbinden</button>
      </form>
      <div class="card">
        <h2>Ausprobieren</h2>
        <p>Die Demo enthält die Wasserkraft-Storymap. Änderungen bleiben nur in diesem Browser.</p>
        <button class="btn btn-block" id="demo">Demo öffnen</button>
        <button class="btn btn-block" id="empty">Leere Story beginnen</button>
        <label class="f" style="margin-top:18px">${t("uiLanguage")}
          <select id="ui-lang">${UI_LANGS.map(([v, l]) => `<option value="${v}" ${v === uiLang() ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
    </div>
  </main>`;
  $("#ui-lang").addEventListener("change", (e) => { setUiLang(e.target.value); renderStart(); });
  $("#demo").addEventListener("click", async () => { await loadDemo(); afterOpen(); });
  $("#empty").addEventListener("click", () => { newEmptyDemo(); afterOpen(); });
  $("#gh-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const [owner, repo] = String(f.get("repo")).trim().replace(/^https:\/\/github.com\//, "").split("/");
    const token = String(f.get("token")).trim();
    const branch = String(f.get("branch") || "entwurf").trim();
    try {
      localStorage.setItem("studio-connection", JSON.stringify({ repo: `${owner}/${repo}`, branch, token: f.get("remember") ? token : "" }));
    } catch (_) {}
    e.target.querySelector("button[type=submit]").textContent = "Verbinde …";
    try {
      const r = await connectGitHub({ owner, repo, token, branch });
      if (r.empty) {
        const d = modal(`<h2>Noch keine Studio-Inhalte</h2><p>Im Repository gibt es noch keine Datei <code>content/story.json</code>.
          Soll eine neue, leere Story angelegt werden? (Bestehende Dateien bleiben unverändert.)</p>
          <div class="modal-actions"><button class="btn" value="no">Abbrechen</button><button class="btn btn-primary" value="yes">Neue Story anlegen</button></div>`);
        d.querySelector(".modal-actions").addEventListener("click", (ev) => {
          if (ev.target.value === "yes") { startNewStoryInRepo(); d.close(); afterOpen(); }
          else if (ev.target.value) d.close();
        });
        return;
      }
      afterOpen();
    } catch (err2) {
      renderStart(err2.status === 401 ? "Der Token wurde abgelehnt. Bitte prüfen oder neu erstellen." :
        err2.status === 404 ? "Repository nicht gefunden – Schreibweise prüfen und ob der Token Zugriff darauf hat." : err2.message);
    }
  });
}

function afterOpen() {
  const d = localDraft();
  if (d && state.mode === "github" && d.at > (state.loadedAt ? state.loadedAt.getTime() - 1 : 0) && JSON.stringify(d.story) !== JSON.stringify(state.story)) {
    const dlg = modal(`<h2>Nicht gespeicherter Entwurf gefunden</h2>
      <p>In diesem Browser liegen Änderungen vom ${new Date(d.at).toLocaleString("de-CH")}, die noch nicht gespeichert wurden.</p>
      <div class="modal-actions"><button class="btn" value="drop">Verwerfen</button><button class="btn btn-primary" value="use">Wiederherstellen</button></div>`);
    dlg.querySelector(".modal-actions").addEventListener("click", (e) => {
      if (e.target.value === "use") useLocalDraft(d);
      if (e.target.value === "drop") dropLocalDraft();
      if (e.target.value) { dlg.close(); shell(); }
    });
    return;
  }
  if (d && state.mode === "demo" && state.repo === "wasserkraft-storymap") useLocalDraft(d), (state.dirty = false);
  shell();
}

// ------------------------------------------------------------ shell
function shell() {
  refreshCitations();
  app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="logo">${icon("tour", 18)}</span><span class="brand-name">Storymap-Studio</span></div>
    <span class="crumb" title="${esc(state.owner + "/" + state.repo)}">${esc(tget(state.story.cover.title, ORIG(state.story), true) || state.repo)}</span>
    <nav class="tabs" aria-label="Bereiche">${TABS.map(([v, k]) => `<button data-view="${v}" class="tab">${t(k)}</button>`).join("")}</nav>
    <div class="top-right">
      <div class="seg seg-lang" role="group" aria-label="${t("language")} der Story" id="langs"></div>
      <span class="save-state" id="save-state"></span>
      <button class="btn" id="preview">${icon("eye", 16)} ${t("preview")}</button>
      <button class="btn btn-primary" id="save">${t("save")}</button>
      <button class="btn btn-icon" id="menu" aria-label="Menü">${icon("gear", 18)}</button>
    </div>
  </header>
  <div id="view" class="view"></div>`;
  $(".tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) { state.view = b.dataset.view; emit("view"); } });
  $("#save").addEventListener("click", doSave);
  $("#preview").addEventListener("click", () => openPreview());
  $("#menu").addEventListener("click", openMenu);
  renderLangs(); renderSaveState(); renderView();
  const setH = () => document.documentElement.style.setProperty("--topbar-h", ($(".topbar") || { offsetHeight: 52 }).offsetHeight + "px");
  setH(); window.onresize = setH;
}

function renderLangs() {
  const box = $("#langs");
  if (!box) return;
  const orig = ORIG(state.story);
  box.innerHTML = state.story.settings.languages.map((l) =>
    `<button type="button" data-lang="${l.code}" class="${l.code === state.lang ? "is-on" : ""}" aria-pressed="${l.code === state.lang}">${l.code.toUpperCase()}${l.code === orig ? "" : ""}</button>`).join("");
  box.onclick = (e) => { const b = e.target.closest("[data-lang]"); if (b) { state.lang = b.dataset.lang; renderLangs(); renderView(); } };
}

function renderSaveState() {
  const el = $("#save-state");
  if (!el) return;
  const where = state.mode === "demo" ? ` · ${t("demo")}` : ` · ${state.owner}/${state.repo} (${state.branch})`;
  el.innerHTML = state.saving ? t("saving") : state.dirty ? `<span class="dot dot-warn"></span>${t("unsaved")}` : `<span class="dot dot-ok"></span>${t("saved")}`;
  el.title = where.slice(3);
}

function renderView() {
  const v = $("#view");
  if (!v) return;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.view === state.view || (state.view === "tour" && b.dataset.view === "write") ? "page" : "false"));
  v.className = "view view-" + state.view;
  v.onclick = null; v.oninput = null; v.onchange = null;
  (VIEWS[state.view] || renderWrite)(v);
}

async function doSave() {
  if (state.mode === "github") {
    const msg = await ask("Kurze Notiz zu den Änderungen (für die Versionsgeschichte):", { input: "Text überarbeitet", ok: "Speichern" });
    if (msg === null) return;
    try { await save(msg); toast("Entwurf gespeichert (Branch " + state.branch + ").", "ok"); }
    catch (e) {
      if (e.conflict) toast("Nicht gespeichert: " + e.message + " Bitte Seite neu laden; Ihre Änderungen sind lokal gesichert.", "error", 9000);
      else toast("Speichern fehlgeschlagen: " + e.message, "error", 8000);
    }
  } else { await save(); toast("In diesem Browser gespeichert (Demo).", "ok"); }
}

function openMenu() {
  const d = modal(`<h2>Einstellungen</h2>
    <label class="f">${t("uiLanguage")} <select id="m-ui">${UI_LANGS.map(([v, l]) => `<option value="${v}" ${v === uiLang() ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <p class="f-help">Verbunden mit: <b>${esc(state.mode === "demo" ? "Demo" : state.owner + "/" + state.repo)}</b>${state.mode === "github" ? ` · Entwürfe im Branch <code>${esc(state.branch)}</code>, veröffentlicht wird nach <code>${esc(state.main)}</code>` : ""}</p>
    <div class="modal-actions">
      <button class="btn" id="m-export">Inhalte herunterladen (story.json, quellen.bib)</button>
      <button class="btn" id="m-logout">${t("logout")}</button>
      <button class="btn btn-primary" value="close">${t("done")}</button>
    </div>`);
  d.querySelector("#m-ui").addEventListener("change", (e) => { setUiLang(e.target.value); d.close(); shell(); });
  d.querySelector("#m-export").addEventListener("click", async () => {
    const { download } = await import("./lib/util.js");
    download("story.json", JSON.stringify(state.story, null, 2));
    download("quellen.bib", state.bib, "text/plain");
  });
  d.querySelector("#m-logout").addEventListener("click", async () => {
    d.close();
    if (state.dirty && !(await ask("Es gibt ungespeicherte Änderungen. Trotzdem abmelden? (Sie bleiben als lokaler Entwurf erhalten.)", { ok: "Abmelden" }))) return;
    try { const c = JSON.parse(localStorage.getItem("studio-connection") || "{}"); c.token = ""; localStorage.setItem("studio-connection", JSON.stringify(c)); } catch (_) {}
    location.reload();
  });
  d.querySelector("[value=close]").addEventListener("click", () => d.close());
}

onChange((what) => {
  if (what === "dirty" || what === "saved") renderSaveState();
  if (what === "view") renderView();
  if (what === "langs") { renderLangs(); renderView(); }
  if (what === "all") shell();
});

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && state.story) { e.preventDefault(); doSave(); }
});
window.addEventListener("beforeunload", (e) => { if (state.dirty && state.mode === "github") { e.preventDefault(); e.returnValue = ""; } });

// ?demo opens the demo directly (used for testing and for showing the studio)
if (new URLSearchParams(location.search).has("demo") || location.hash === "#demo") loadDemo().then(afterOpen);
else renderStart();
