// state.js — the studio's single store: story, sources, media, connection.
import { GitHub } from "./github.js";
import { makeCiter } from "./lib/cite.js";
import { ORIG, emptyStory } from "./model.js";
import { b64ToUtf8, utf8ToB64, fileToBase64, slugify, esc, debounce } from "./lib/util.js";

export const STORY_PATH = "content/story.json";
export const BIB_PATH = "content/quellen.bib";

export const state = {
  mode: null,            // "demo" | "github"
  gh: null, owner: "", repo: "", branch: "entwurf", main: "main",
  story: null, bib: "", citer: null,
  pending: new Map(),    // repo path -> { b64, url, name, type }
  dirty: false, saving: false, loadedAt: null, remoteHead: null, baseStoryText: "",
  lang: "de", view: "write",
  chapterId: null, blockId: null, tourBlockId: null, slideId: null, layerId: null,
  media: new Map(),      // repo path -> object URL (cache)
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export function emit(what = "all") { for (const fn of listeners) fn(what); }

export function rebuildCiter() {
  state.citer = makeCiter(state.bib || "", { defaultLang: state.story ? ORIG(state.story) : "de" });
  return state.citer;
}
export const setBib = (text) => { state.bib = text; rebuildCiter(); markDirty(); };

const draftKey = () => `studio-draft:${state.mode}:${state.owner}/${state.repo}`;
const autosave = debounce(() => {
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ story: state.story, bib: state.bib, at: Date.now(), base: state.remoteHead }));
  } catch (_) { /* storage full or unavailable: the draft stays in memory */ }
}, 800);

export function markDirty() {
  state.dirty = true;
  autosave();
  emit("dirty");
}

function afterLoad(story, bib) {
  state.story = story;
  state.bib = bib || "";
  state.lang = ORIG(story);
  state.chapterId = story.chapters[0] && story.chapters[0].id;
  state.blockId = null;
  rebuildCiter();
  state.dirty = false;
  state.loadedAt = new Date();
}

// local draft newer than what was loaded? offer it
export function localDraft() {
  try { const d = JSON.parse(localStorage.getItem(draftKey()) || "null"); return d && d.story ? d : null; }
  catch (_) { return null; }
}
export function useLocalDraft(d) { state.story = d.story; state.bib = d.bib || ""; rebuildCiter(); state.dirty = true; }
export function dropLocalDraft() { try { localStorage.removeItem(draftKey()); } catch (_) {} }

// ------------------------------------------------------------ demo mode
export async function loadDemo() {
  state.mode = "demo"; state.owner = "demo"; state.repo = "wasserkraft-storymap";
  const bibRes = await fetch("demo/quellen.bib").then((r) => (r.ok ? r : fetch("demo/quellen.bib.txt")));
  const [s, b] = await Promise.all([fetch("demo/story.json").then((r) => r.json()), bibRes.text()]);
  afterLoad(s, b);
}
export function newEmptyDemo() {
  state.mode = "demo"; state.owner = "demo"; state.repo = "neu";
  afterLoad(emptyStory(), "");
}

// ------------------------------------------------------------ GitHub mode
export async function connectGitHub({ owner, repo, token, branch = "entwurf", main }) {
  const gh = new GitHub({ owner, repo, token });
  const info = await gh.repoInfo();
  if (info.permissions && !info.permissions.push) throw new Error("Dieses Konto darf im Repository nicht schreiben.");
  state.mode = "github"; state.gh = gh; state.owner = owner; state.repo = repo;
  state.main = main || info.default_branch || "main";
  state.branch = branch;
  state.remoteHead = await gh.ensureBranch(state.branch, state.main);
  const [storyText, bib] = await Promise.all([gh.readText(STORY_PATH, state.branch), gh.readText(BIB_PATH, state.branch)]);
  if (!storyText) return { empty: true };
  afterLoad(JSON.parse(storyText), bib || "");
  state.baseStoryText = storyText;
  return { empty: false };
}
export function startNewStoryInRepo() { afterLoad(emptyStory(), ""); state.dirty = true; }

// save = commit to the draft branch (story, sources, new media)
export async function save(message) {
  if (state.mode !== "github") { autosave(); state.dirty = false; emit("saved"); return { local: true }; }
  state.saving = true; emit("dirty");
  try {
    const head = await state.gh.refSha(state.branch);
    if (state.remoteHead && head !== state.remoteHead) {
      const remote = await state.gh.readText(STORY_PATH, state.branch);
      if (remote && remote !== state.baseStoryText) {
        const e = new Error("Jemand anderes hat in der Zwischenzeit gespeichert."); e.conflict = true; throw e;
      }
    }
    const text = JSON.stringify(state.story, null, 2) + "\n";
    const files = [{ path: STORY_PATH, content: utf8ToB64(text) }, { path: BIB_PATH, content: utf8ToB64(state.bib || "") }];
    for (const [path, f] of state.pending) files.push({ path, content: f.b64 });
    const sha = await state.gh.commit(state.branch, message || "Storymap-Studio: Entwurf gespeichert", files);
    state.remoteHead = sha; state.baseStoryText = text; state.pending.clear();
    state.dirty = false; dropLocalDraft();
    emit("saved");
    return { sha };
  } finally { state.saving = false; emit("dirty"); }
}

export async function publish(message) {
  if (state.dirty) await save("Storymap-Studio: Entwurf vor dem Veröffentlichen gespeichert");
  const r = await state.gh.merge(state.main, state.branch, message || "Storymap-Studio: veröffentlicht");
  return r;  // null = nothing to merge (already published)
}

// ------------------------------------------------------------ media
export async function addMedia(file, dir = "media") {
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  let base = slugify(file.name.replace(/\.[^.]+$/, "")), path = `${dir}/${base}${ext}`, i = 2;
  while (state.pending.has(path)) path = `${dir}/${base}-${i++}${ext}`;
  const b64 = await fileToBase64(file);
  const url = URL.createObjectURL(file);
  state.pending.set(path, { b64, url, name: file.name, type: file.type });
  state.media.set(path, url);
  markDirty();
  return path;
}
export function addTextFile(path, text) {
  const b64 = utf8ToB64(text);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  state.pending.set(path, { b64, url, name: path.split("/").pop(), type: "application/json" });
  state.media.set(path, url);
  markDirty();
  return path;
}

const placeholder = (path) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="100%" height="100%" fill="#DCE4EC"/><text x="50%" y="50%" font-family="sans-serif" font-size="18" fill="#3D4753" text-anchor="middle">${esc(path.split("/").pop())}</text></svg>`);

export async function mediaUrl(path) {
  if (!path) return "";
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (state.media.has(path)) return state.media.get(path);
  let url;
  try {
    if (state.mode === "github") url = URL.createObjectURL(await state.gh.readBlob(path, state.branch));
    else {
      const r = await fetch("demo/" + path);
      url = r.ok ? URL.createObjectURL(await r.blob()) : placeholder(path);
    }
  } catch (_) { url = placeholder(path); }
  state.media.set(path, url);
  return url;
}
export async function readRepoText(path) {
  if (state.pending.has(path)) return b64ToUtf8(state.pending.get(path).b64);
  if (state.mode === "github") return state.gh.readText(path, state.branch);
  let r = await fetch("demo/" + path);
  if (!r.ok) r = await fetch("demo/" + path + ".json");   // copies with a .json ending (hosts that refuse .geojson)
  return r.ok ? r.text() : null;
}

export function siteUrl(lang) {
  const s = state.story.settings;
  const host = s.domain ? `https://${s.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : `https://${state.owner}.github.io`;
  const base = s.domain ? (s.basePath ? "/" + s.basePath : "") : "/" + (s.basePath || state.repo);
  const l = lang ? (s.languages.find((x) => x.code === lang) || {}).path || lang : "";
  return `${host}${base}/${l ? l + "/" : ""}`;
}
