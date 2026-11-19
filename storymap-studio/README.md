# Storymap-Studio

A browser-based editor for storymaps like
[Wasserkraft-Storymap](https://hydrosuisse.github.io/wasserkraft-storymap/): write text, insert
blocks (image, table, live chart, embedded page, video, map, 3D tour, layers from QGIS or mapgl),
cite sources from a BibTeX file, translate into French and publish – no R code, no chunks.

The studio is a static web page (HTML and JavaScript, no server, no build step). It saves into the
**GitHub repository of the story**; GitHub Actions builds the page there with R (`build.R`).

The editor's interface is in German.

```
Storymap-Studio (browser)  ──save──▶  story repo, branch "entwurf"  ──▶ (optional) preview page
                           ──publish (merge)──▶  branch "main"  ──GitHub Actions──▶  GitHub Pages /de/ /fr/
```

## Hosting the studio (once)

1. Create a new repository on GitHub, e.g. `hydrosuisse/storymap-studio` (public or private).
2. Upload all files from this folder (keep the folder structure).
3. In the repository: **Settings → Pages → Build and deployment → Source: «Deploy from a branch»**,
   branch `main`, folder `/ (root)` → Save.
4. After about a minute the studio is available at `https://hydrosuisse.github.io/storymap-studio/`.

To try it out locally: `python3 -m http.server 8000` in this folder, then open
`http://localhost:8000/?demo` (demo mode, changes stay in the browser).

## Signing in (each person, once per device)

The studio works with a personal GitHub access token. It is stored only in your own browser
(and only if «Auf diesem Gerät merken» is ticked) and is only ever sent to `api.github.com`.

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. *Repository access*: «Only select repositories» → the story repository (e.g. `hydrosuisse/wasserkraft-storymap`)
3. *Permissions → Repository permissions → Contents*: **Read and write** (nothing else needed)
4. Copy the token into the studio together with `hydrosuisse/wasserkraft-storymap`.

Who may edit is controlled by the collaborators of the story repository on GitHub.

## What happens where

| Action in the studio | In the repository |
|---|---|
| **Speichern** (save) | Commit to the branch `entwurf` (created automatically): `content/story.json`, `content/quellen.bib`, new files under `media/` and `data/geo/` |
| **Vorschau** (button at the top) | Rendered right away in the browser (text, images, tables, citations, credits, embeddings; maps and tours as placeholders) |
| Preview page | Every save on `entwurf` builds a full preview into the repository `<name>-vorschau` – if set up (see the story repository's README) |
| **Veröffentlichen** (publish) | `entwurf` is merged into `main` → GitHub Actions builds `/de/`, `/fr/` → online after about 2–3 minutes |
| **Versionen** (versions) | Git history of `main`; «Als Entwurf laden» brings an older version back as a draft |

Unsaved changes are also kept in the browser (local draft) and offered again the next time you open the studio.

## Features

- **Writing:** text with formatting (bold, italic, superscript/subscript, lists, links), chapters with a navigation label,
  blocks inserted with «+» between paragraphs or from the «Bausteine» area
- **Citing:** type `@` or `\cite{` → suggestions from the library; also recognised: `\citep{a,b}`, `\citet{a}`, `[@a; @b]`.
  Only cited entries go into the reference list (APA 6, sorted automatically, a/b suffixes). The APA words
  («und», «Hrsg.», «o. J.», «Abgerufen am») follow the language of each entry (`langid`); nothing is translated in
  translated versions. `urldate = {heute}` sets the build date as the retrieval date.
- **Credits:** image, video and table credits are suggested from the blocks (caption, author, year, data source)
  and can be edited in «Nachweise»
- **Translation:** original and translation side by side, status per passage (missing, outdated, translated).
  Typography is applied automatically when publishing (fr-CH: « » with narrow spaces, spaces before ; ! ? : %, en dash,
  apostrophe, optional decimal comma; de-CH: «», 95 %, 2015–2026)
- **Maps and tours:** swisstopo base map (light, colour, aerial), 3D terrain, slides with camera («take over current
  view»), points with LV95/WGS84 conversion, lines, **layers from QGIS** (GeoJSON in any CRS – LV95/LV03 are
  converted – plus QML style), **mapgl layers** (circle, line, fill, 3D fill, heatmap, symbol, raster; GeoJSON,
  vector tiles, raster tiles, geo.admin.ch layers)
- **Live charts:** BFE templates or your own data source (CSV/JSON via URL or a file in the repository, Energy-Charts
  format detected), refreshed daily
- **Video:** file (with subtitles per language), YouTube, Vimeo, SWITCHtube – external players load only after a click
- **Address:** your own domain or the GitHub address, path, language codes (`…/de/`, `…/fr/`), forwarding from the
  address without a language code
- **Interface language:** German. French and English cover the main navigation and buttons
  (`js/lib/i18n.js`, can be extended)

## Limits of this first version

- The in-browser preview shows maps, tours and 3D terrain as placeholders; they appear on the preview page and on the
  published page.
- Images are not reduced in size automatically: use PNG/JPG at a sensible size (about 2400 px wide is enough).
- Two people editing the same story at the same time: the second save is refused with a notice
  (no automatic merging); your changes stay in the browser.
- There is no automatic machine translation; «Original als Vorlage kopieren» copies the original including its citations.

## Files

```
index.html              entry point
css/studio.css          interface
js/app.js               start screen, top bar, areas
js/state.js             story, sources, media, saving/publishing
js/github.js            GitHub API (commit, merge, history)
js/model.js             data model, translation status, credits, checks
js/richtext.js          text editor with citation suggestions
js/blocks.js            blocks: menu, settings, cards
js/forms.js             settings panels
js/maplayers.js         map layers (preview + mapgl code)
js/views/*.js           Schreiben, Bausteine, Tour, Quellen, Nachweise, Übersetzung, Veröffentlichen, Vorschau
js/lib/cite.js          BibTeX + APA 6 (identical to tools/cite.mjs in the story repository)
js/lib/geo.js           LV95/WGS84, QGIS GeoJSON/QML, simplification
preview/                storymap.css/.js of the story (for the preview)
vendor/maplibre-gl/     MapLibre GL JS 5.24.0 (BSD-3-Clause, see LICENSE.txt)
demo/                   demo story (Wasserkraft)
```

When `assets/storymap.css` or `storymap.js` change in the story repository, copy them into `preview/` too;
the same applies to `js/lib/cite.js` ↔ `tools/cite.mjs`.
