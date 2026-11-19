// forms.js — builds the settings panel ("Inspector") from a small field schema.
import { state, addMedia, mediaUrl, markDirty } from "./state.js";
import { tget, tset, ORIG } from "./model.js";
import { getPath, setPath, esc, uid, tell } from "./lib/util.js";
import { richText } from "./richtext.js";

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === "string" && c.startsWith("<svg")) { const s = document.createElement("span"); s.className = "ico"; s.innerHTML = c; el.appendChild(s); }
    else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

// schema field: { key, label, type, options, help, required, show(obj), placeholder, accept, dir, min, max, step }
export function renderForm(obj, schema, { onChange, lang = state.lang } = {}) {
  const orig = obj.origLang || ORIG(state.story);
  const wrap = h("div", { class: "form" });
  const changed = (key, rerender = false) => { markDirty(); onChange && onChange(key, rerender); };
  for (const f of schema) {
    if (f.show && !f.show(obj)) continue;
    const id = "f-" + uid("");
    const label = (txt, extra) => h("label", { class: "f-label", for: id }, txt, f.required ? h("span", { class: "f-req" }, " Pflichtfeld") : null, extra || null);
    const help = f.help ? h("p", { class: "f-help" }, f.help) : null;
    let field;
    switch (f.type) {
      case "heading": field = h("h3", { class: "f-heading" }, f.label); break;
      case "note": field = h("p", { class: "f-note", html: f.html || esc(f.label) }); break;
      case "custom": field = f.render(obj, changed); break;
      case "i18n": case "i18nArea": {
        const o = getPath(obj, f.key) || {};
        if (!getPath(obj, f.key)) setPath(obj, f.key, o);
        const val = tget(o, lang);
        const ph = lang !== orig ? tget(o, orig) : (f.placeholder || "");
        const input = f.type === "i18n"
          ? h("input", { id, value: val, placeholder: ph, lang })
          : h("textarea", { id, rows: f.rows || 3, placeholder: ph, lang }, val);
        input.addEventListener("input", () => { tset(o, lang, input.value, orig); changed(f.key); });
        const count = f.max ? h("span", { class: "f-count" }, `${val.length}/${f.max}`) : null;
        if (count) input.addEventListener("input", () => (count.textContent = `${input.value.length}/${f.max}`));
        field = h("div", { class: "f" }, label(f.label, lang !== orig ? h("span", { class: "f-lang" }, " · " + lang.toUpperCase()) : null), input, count, help);
        break;
      }
      case "html": {
        const o = getPath(obj, f.key) || {};
        if (!getPath(obj, f.key)) setPath(obj, f.key, o);
        const ed = richText({ html: tget(o, lang) || "<p></p>", lang, className: "rt-small",
          placeholder: lang !== orig ? "Übersetzung …" : "Text …",
          onChange: (v) => { tset(o, lang, v, orig); changed(f.key); } });
        field = h("div", { class: "f" }, h("span", { class: "f-label" }, f.label), ed, help);
        break;
      }
      case "text": case "url": case "number": {
        const input = h("input", { id, type: f.type === "number" ? "number" : "text", value: getPath(obj, f.key) ?? "",
          placeholder: f.placeholder || "", min: f.min, max: f.max, step: f.step });
        input.addEventListener("input", () => {
          setPath(obj, f.key, f.type === "number" ? (input.value === "" ? null : +input.value) : input.value);
          changed(f.key);
        });
        if (f.rerender) input.addEventListener("change", () => changed(f.key, true));
        field = h("div", { class: "f" }, label(f.label), input, help);
        break;
      }
      case "color": {
        const v = getPath(obj, f.key) || "#000000";
        const input = h("input", { id, type: "color", value: v });
        const txt = h("input", { type: "text", value: v, class: "f-colortext", "aria-label": f.label + " (Hex)" });
        input.addEventListener("input", () => { setPath(obj, f.key, input.value.toUpperCase()); txt.value = input.value.toUpperCase(); changed(f.key); });
        txt.addEventListener("change", () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) { setPath(obj, f.key, txt.value.toUpperCase()); input.value = txt.value; changed(f.key); } });
        field = h("div", { class: "f f-inline" }, label(f.label), h("span", { class: "f-color" }, input, txt), help);
        break;
      }
      case "range": {
        const v = getPath(obj, f.key) ?? f.min ?? 0;
        const out = h("span", { class: "f-range-val" }, (f.format || String)(v));
        const input = h("input", { id, type: "range", min: f.min, max: f.max, step: f.step || 1, value: v });
        input.addEventListener("input", () => { setPath(obj, f.key, +input.value); out.textContent = (f.format || String)(+input.value); changed(f.key); });
        if (f.rerender) input.addEventListener("change", () => changed(f.key, true));
        field = h("div", { class: "f" }, label(f.label, out), input, help);
        break;
      }
      case "toggle": {
        const input = h("input", { id, type: "checkbox", role: "switch", class: "switch" });
        input.checked = !!getPath(obj, f.key);
        input.addEventListener("change", () => { setPath(obj, f.key, input.checked); changed(f.key, true); });
        field = h("div", { class: "f f-inline" }, h("label", { for: id, class: "f-label" }, f.label), input, help);
        break;
      }
      case "select": {
        const sel = h("select", { id }, ...f.options.map(([v, l]) => h("option", { value: v }, l)));
        sel.value = getPath(obj, f.key) ?? f.options[0][0];
        sel.addEventListener("change", () => { setPath(obj, f.key, sel.value); changed(f.key, true); });
        field = h("div", { class: "f" }, label(f.label), sel, help);
        break;
      }
      case "seg": {
        const cur = getPath(obj, f.key) ?? f.options[0][0];
        const grp = h("div", { class: "seg", role: "radiogroup", "aria-label": f.label });
        for (const [v, l] of f.options) {
          const b = h("button", { type: "button", role: "radio", "aria-checked": String(String(v) === String(cur)), class: String(v) === String(cur) ? "is-on" : "" }, l);
          b.addEventListener("click", () => { setPath(obj, f.key, v); changed(f.key, true); });
          grp.appendChild(b);
        }
        field = h("div", { class: "f" }, h("span", { class: "f-label" }, f.label), grp, help);
        break;
      }
      case "credit": {
        const c = getPath(obj, f.key) || {}; if (!getPath(obj, f.key)) setPath(obj, f.key, c);
        const a = h("input", { value: c.author || "", placeholder: "z. B. Alpiq oder CC BY 4.0", "aria-label": "Urheber/in" });
        const y = h("input", { value: c.year || "", placeholder: "2026", "aria-label": "Jahr", class: "f-year" });
        a.addEventListener("input", () => { c.author = a.value; changed(f.key); });
        y.addEventListener("input", () => { c.year = y.value; changed(f.key); });
        field = h("div", { class: "f" }, h("span", { class: "f-label" }, f.label || "Bildnachweis"),
          h("div", { class: "f-row" }, h("label", { class: "f-sub" }, "Urheber/in", a), h("label", { class: "f-sub f-sub-s" }, "Jahr", y)),
          h("p", { class: "f-help" }, "Wird als Vorschlag in die Bildnachweise übernommen und kann dort angepasst werden."));
        break;
      }
      case "sources": field = sourcesField(obj, f, changed); break;
      case "media": field = mediaField(obj, f, changed); break;
      default: field = h("p", {}, "?" + f.type);
    }
    wrap.appendChild(field);
  }
  return wrap;
}

// ------------------------------------------------------------ sources (citation keys)
export function sourcesField(obj, f, changed) {
  const list = getPath(obj, f.key) || []; if (!getPath(obj, f.key)) setPath(obj, f.key, list);
  const box = h("div", { class: "chips" });
  const draw = () => {
    box.innerHTML = "";
    for (const k of list) {
      const rm = h("button", { type: "button", "aria-label": "Entfernen" }, "×");
      rm.addEventListener("click", () => { list.splice(list.indexOf(k), 1); draw(); changed(f.key); });
      box.appendChild(h("span", { class: "chip" + (state.citer && !state.citer.entries.get(k) ? " chip-bad" : "") },
        state.citer ? state.citer.label(k, "t") : k, " ", rm));
    }
    const add = h("button", { type: "button", class: "chip chip-add" }, "+ Quelle");
    add.addEventListener("click", () => pickSource((k) => { if (!list.includes(k)) list.push(k); draw(); changed(f.key); }, add));
    box.appendChild(add);
  };
  draw();
  return h("div", { class: "f" }, h("span", { class: "f-label" }, f.label || "Quellen"), box,
    f.help ? h("p", { class: "f-help" }, f.help) : null);
}

export function pickSource(onPick, anchor) {
  document.querySelectorAll(".src-pick").forEach((x) => x.remove());
  const pop = h("div", { class: "cite-pop src-pick" });
  const q = h("input", { placeholder: "Autor, Titel, Jahr …", "aria-label": "Quelle suchen" });
  const res = h("div", {});
  const draw = () => {
    const ks = state.citer ? state.citer.search(q.value, 12) : [];
    res.innerHTML = ks.length ? "" : `<div class="cite-empty">Keine Quellen. Unter «Quellen» eine .bib-Datei laden.</div>`;
    for (const k of ks) {
      const e = state.citer.entries.get(k);
      const o = h("div", { class: "cite-opt", role: "option", tabindex: "0" }, h("b", {}, state.citer.label(k, "t")), " · " + (e.fields.title || "").slice(0, 70));
      o.addEventListener("click", () => { onPick(k); pop.remove(); });
      o.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { onPick(k); pop.remove(); } });
      res.appendChild(o);
    }
  };
  q.addEventListener("input", draw);
  pop.append(q, res);
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.top = r.bottom + window.scrollY + 4 + "px";
  pop.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 440) + "px";
  draw(); q.focus();
  const outside = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener("mousedown", outside, true); } };
  setTimeout(() => document.addEventListener("mousedown", outside, true));
}

// ------------------------------------------------------------ media (file upload or repo path)
function mediaField(obj, f, changed) {
  const thumb = h("div", { class: "thumb" });
  const name = h("div", { class: "thumb-name" });
  const draw = async () => {
    const p = getPath(obj, f.key);
    name.innerHTML = p ? `${esc(p.split("/").pop())}<br><span class="muted">${esc(p)}</span>` : `<span class="muted">Keine Datei gewählt</span>`;
    thumb.innerHTML = "";
    if (p && /\.(png|jpe?g|gif|webp|svg)$/i.test(p)) {
      const img = h("img", { alt: "" }); img.src = await mediaUrl(p); thumb.appendChild(img);
    }
  };
  const file = h("input", { type: "file", accept: f.accept || "image/*", class: "visually-hidden", id: "file-" + uid("") });
  file.addEventListener("change", async () => {
    if (!file.files[0]) return;
    const fl = file.files[0];
    if (fl.size > 95 * 1024 * 1024) { tell("Die Datei ist grösser als 95 MB. GitHub speichert keine Dateien über 100 MB – bitte extern hosten."); return; }
    const p = await addMedia(fl, f.dir || "media");
    setPath(obj, f.key, p); await draw(); changed(f.key, true);
  });
  const pick = h("label", { for: file.id, class: "btn btn-small" }, getPath(obj, f.key) ? "Ersetzen" : "Datei wählen");
  const path = h("input", { value: getPath(obj, f.key) || "", placeholder: "oder Pfad im Repo, z. B. assets/bild.jpg", class: "f-path", "aria-label": "Pfad im Repo" });
  path.addEventListener("change", async () => { setPath(obj, f.key, path.value.trim()); await draw(); changed(f.key, true); });
  draw();
  return h("div", { class: "f" }, h("span", { class: "f-label" }, f.label, f.required ? h("span", { class: "f-req" }, " Pflichtfeld") : null),
    h("div", { class: "media-row" }, thumb, name, pick, file), path, f.help ? h("p", { class: "f-help" }, f.help) : null);
}
