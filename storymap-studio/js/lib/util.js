// util.js — small helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// djb2 over UTF-16 code units -> base36 (same as migrate.py and the R build)
export function hash(s) {
  let h = 5381;
  s = String(s || "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function uid(prefix = "b") {
  return prefix + Math.random().toString(36).slice(2, 8);
}

export function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "datei";
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, val) {
  const ks = path.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null || typeof o[ks[i]] !== "object") o[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

export const stripTags = (h) => String(h || "").replace(/<cite[^>]*>.*?<\/cite>/g, " [Q] ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
export function fileToText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsText(file);
  });
}
export const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
export const utf8ToB64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

export function toast(msg, kind = "info", ms = 4000) {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  const el = document.createElement("div");
  el.className = "toast toast-" + kind;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// simple modal dialog; returns the <dialog>
export function modal(html, { wide = false, onClose } = {}) {
  const d = document.createElement("dialog");
  d.className = "modal" + (wide ? " modal-wide" : "");
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener("close", () => { d.remove(); onClose && onClose(); });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}

export const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  chart: '<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  tour: '<path d="M3 19l6-10 4 6 3-4 5 8H3z"/><circle cx="17" cy="6" r="2"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M10 4v16"/>',
  embed: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>',
  abstract: '<rect x="4" y="5" width="16" height="14" rx="1"/><path d="M8 10h8M8 14h5"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2v8l-4-2z"/>',
  qgis: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  layers: '<path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 17l8 4 8-4"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
};
export const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;

// in-page replacements for confirm/prompt/alert (also work where native dialogs are blocked)
export function ask(message, { input = null, ok = "OK", cancel = "Abbrechen", danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const d = modal(`<p class="ask-msg">${esc(message)}</p>
      ${input !== null ? `<input class="ask-input" value="${esc(input)}" aria-label="${esc(message)}">` : ""}
      <div class="modal-actions">${cancel ? `<button class="btn" value="cancel">${esc(cancel)}</button>` : ""}
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" value="ok">${esc(ok)}</button></div>`,
      { onClose: () => { if (!done) resolve(input !== null ? null : false); } });
    const inp = d.querySelector(".ask-input");
    if (inp) { inp.focus(); inp.select(); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") d.querySelector("[value=ok]").click(); }); }
    d.querySelector(".modal-actions").addEventListener("click", (e) => {
      const v = e.target.value; if (!v) return;
      done = true; d.close();
      resolve(v === "ok" ? (inp ? inp.value : true) : (inp ? null : false));
    });
  });
}
export const tell = (message) => ask(message, { cancel: null });
