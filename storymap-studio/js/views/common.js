// common.js — shared bits of the views
import { state, rebuildCiter } from "../state.js";
import { ORIG, translatables, allBlocks } from "../model.js";
import { MENU } from "../blocks.js";
import { esc, icon, slugify } from "../lib/util.js";

// recompute a/b suffixes etc. in reading order so chip labels match the published page
export function refreshCitations() {
  const c = state.citer || rebuildCiter();
  c.reset();
  const orig = ORIG(state.story);
  const cites = [];
  const scan = (html) => {
    const re = /<cite data-keys="([^"]+)" data-form="(p|t)"/g; let m;
    while ((m = re.exec(html || ""))) cites.push({ keys: m[1].split(","), form: m[2] });
  };
  for (const x of translatables(state.story)) scan(x.obj[x.origLang] || x.obj[orig]);
  for (const { b } of allBlocks(state.story)) {
    if (b.sources && b.sources.length) cites.push({ keys: b.sources, form: "t" });
    for (const l of b.layers || []) if (l.sources && l.sources.length) cites.push({ keys: l.sources, form: "t" });
  }
  c.cite(cites);
}

export function chapterSlug(title, existing) {
  let base = slugify(title) || "kapitel", s = base, i = 2;
  while (existing.includes(s)) s = `${base}-${i++}`;
  return s;
}

// block menu popover; calls onPick(type, preset)
export function blockMenu(anchor, onPick) {
  document.querySelectorAll(".block-menu").forEach((x) => x.remove());
  const pop = document.createElement("div");
  pop.className = "block-menu";
  pop.setAttribute("role", "menu");
  pop.innerHTML = `<label class="menu-search">${icon("search", 16)}<input placeholder="Baustein suchen …" aria-label="Baustein suchen"></label>
    <div class="menu-grid">${MENU.map((m, i) => `<button role="menuitem" data-i="${i}" class="menu-item">
      <span class="menu-icon">${icon(m.icon, 18)}</span><span><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span></button>`).join("")}</div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = r.bottom + window.scrollY + 6 + "px";
  pop.style.left = Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 580)) + "px";
  const q = pop.querySelector("input");
  q.focus();
  q.addEventListener("input", () => {
    const s = q.value.toLowerCase();
    pop.querySelectorAll(".menu-item").forEach((b) => (b.hidden = !b.textContent.toLowerCase().includes(s)));
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const b = [...pop.querySelectorAll(".menu-item")].find((x) => !x.hidden); if (b) b.click(); }
    if (e.key === "Escape") close();
  });
  const close = () => { pop.remove(); document.removeEventListener("mousedown", outside, true); };
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener("mousedown", outside, true));
  pop.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const m = MENU[+b.dataset.i];
    close();
    onPick(m.type, m.preset);
  });
}

export function statusChip(st) {
  const map = { ok: ["chip-ok", "✓ Übersetzt"], missing: ["chip-bad", "Fehlt"], outdated: ["chip-warn", "Veraltet"],
    suggested: ["chip-info", "Vorschlag"], custom: ["chip-ok", "Angepasst"] };
  const [c, l] = map[st] || ["", st];
  return `<span class="chip ${c}">${l}</span>`;
}
