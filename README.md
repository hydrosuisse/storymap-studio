# Wasserkraft CH – story map

Suggested repository: **`hydrosuisse/wasserkraft-storymap`**
→ published at **https://hydrosuisse.github.io/wasserkraft-storymap/**

A static story page in the style of an ArcGIS StoryMap (standard theme "Summit"),
built with R Markdown and mapgl. Three parts are embedded and load separately,
only when the reader scrolls near them:

| Part | Where it lives | Updates |
|---|---|---|
| Story (text, cover, maps, map tour) | `index.Rmd` → GitHub Pages | on every push |
| Chart "Füllstände der Speicherseen" | `charts/speicherseen.html` (built by `build.R`) | daily (GitHub Actions) |
| Chart "Stromproduktion und Landesverbrauch" | `charts/produktion.html` (built by `build.R`) | daily (GitHub Actions) |
| Dashboard "Wasserkraft und Spotpreise" | unchanged at https://hydrosuisse.shinyapps.io/wasserkraft-ch/ | as before |

The story page itself needs no server and appears immediately. The two charts
are plain HTML pages that load when the reader scrolls near them. The dashboard
starts loading 2 seconds after the story page has finished loading (or as soon
as the reader reaches it, if that is earlier), so the shinyapps.io app is usually
awake by the time it is needed. Until then a loading notice is shown.

## Files

```
index.Rmd                   the story: text, order of sections, maps, embeds
build.R                     builds everything into _site/
R/storymap.R                story blocks: sm_header, sm_cover, sm_nav, sm_map,
                            sm_sidecar/sm_slide/sm_slide_image, sm_frame,
                            sm_image (zoom = TRUE), sm_credits
R/bfe_charts.R              BFE data download + the two plotly charts
assets/storymap.css/.js     story styling (Summit) and behaviour
assets/chart.css/.js        chart pages: dashboard look, Frutiger, auto-height
assets/fonts/               place licensed Frutiger web fonts here (optional)
data/kraftwerke.csv         example points for the overview map (approximate – replace)
data/staumauern.csv         the four dams of the 3D map tour (BFE dam register)
assets/vendor/              plugin for swisstopo 3D terrain (BSD-3) + decoder (MIT)
data/snapshot/              last good BFE data (fallback, updated by the workflow)
.github/workflows/build-deploy.yml   daily build + deploy to GitHub Pages
```

## Set up on GitHub

1. Create the repository `hydrosuisse/wasserkraft-storymap` and push these files.
2. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
3. *Settings → Actions → General → Workflow permissions:* **Read and write**
   (so the workflow can save the data snapshot).
4. Run the workflow once (*Actions → Build and deploy story → Run workflow*).
   After that it runs on every push and every morning.

## Build locally

```r
install.packages(c("rmarkdown", "mapgl", "sf", "plotly", "htmltools", "jsonlite"))
source("build.R")
servr::httd("_site")        # or open _site/index.html via any local web server
```

## The BFE charts

* Data come from the JSON endpoints the Energie-Dashboard uses itself
  (`https://energiedashboard.admin.ch/api/strom/...`). These are not a documented
  public API; if the BFE changes them, the build keeps using the last snapshot
  and the log says "not reachable". Adjust `bfe_api` / endpoints in `R/bfe_charts.R`.
* Colours, stacking order, legend and axes imitate the dashboard. Labels are German.
* Source attribution "Bundesamt für Energie BFE" is shown under each chart (required by the OGD terms).

## Frutiger

The charts use Frutiger like the Energie-Dashboard where possible. Frutiger is a commercial font
and may not be copied from admin.ch. It is used

1. automatically on computers where it is installed (common in the federal administration), or
2. for everyone, if hydrosuisse owns a web-font licence: put the files as
   `assets/fonts/FrutigerNeue-Regular.woff2` and `assets/fonts/FrutigerNeue-Bold.woff2`.

Otherwise the charts fall back to Roboto.
To use Frutiger for the story text too, set `--sm-font-head` in `assets/storymap.css` to
`"Frutiger Web", "Frutiger LT Com", Roboto, sans-serif` and copy the `@font-face` rules from `assets/chart.css`.

## Embedding the dashboard

`sm_frame()` in `index.Rmd` loads the shinyapps.io app with `load = "after_page", delay_ms = 2000`
(start 2 s after the page has loaded; use `load = "lazy"` to load only on scrolling). It uses a fixed height
(`height = "1300px"`, `height_mobile = "1900px"`). The app is on another domain,
so it cannot report its height. Adjust these values if the dashboard grows or shrinks.
The free shinyapps.io plan has a monthly limit of active hours. Each story visit that reaches
the dashboard counts towards it.

## Storymap-Studio (editing without code)

The story can also be written with the **Storymap-Studio** (separate repository, e.g.
`hydrosuisse/storymap-studio`). The studio stores its content in this repository:

```
content/story.json     chapters, blocks, translations, settings (written by the studio)
content/quellen.bib    sources (BibTeX); only cited entries appear, APA 6
media/                 images, videos, subtitles uploaded in the studio
data/geo/              GeoJSON layers imported from QGIS
```

**As soon as `content/story.json` exists, `build.R` builds the studio version** (pages under
`/de/`, `/fr/`, … plus a forwarding page at `/`); without it, `index.Rmd` is built as before.

Files for the studio build:

```
R/studio_build.R       story.json -> pages per language (blocks, maps/tours via mapgl, citations, credits)
R/studio_charts.R      "Live-Grafik" blocks with an own data source (CSV/JSON, refreshed daily)
tools/cite.mjs         BibTeX + APA 6 (the same code as in the studio)
tools/cite-render.mjs  called by R via node
```

To build the studio version on your own computer (`Rscript build.R`), [Node.js](https://nodejs.org) must be
installed as well (it formats the citations). GitHub Actions installs it automatically.

### Switching to the studio

1. Copy `studio-start/content/` into this repository as `content/` (it contains the current story,
   converted from the last page version, and `quellen.bib` with all sources).
2. Check the result in the studio before pushing to `main` – once `content/story.json` is on `main`, the published
   page is the studio version (old links to `…/wasserkraft-storymap/` keep working and forward to `/de/`).
3. `index.Rmd` can stay in the repository as an archive; it is no longer used.

### Branches

- `entwurf` – the studio saves here. Nothing is published.
- `main` – «Veröffentlichen» in the studio merges `entwurf` into `main`; GitHub Actions builds and publishes.

### Preview page for drafts (optional)

Every save on `entwurf` can build a complete preview page (with maps, tours, charts):

1. Create an empty public repository `hydrosuisse/wasserkraft-storymap-vorschau`, and in it
   **Settings → Pages → Deploy from a branch → `gh-pages` / root**.
2. Create a fine-grained token with **Contents: Read and write** on that repository.
3. In **this** repository: **Settings → Secrets and variables → Actions → New repository secret**,
   name `PREVIEW_TOKEN`, value = the token.

The preview is then at `https://hydrosuisse.github.io/wasserkraft-storymap-vorschau/de/`.
Without the secret, `entwurf` is built anyway (as a check) but not published.

### Own domain

Enter the domain in the studio under «Veröffentlichen → Adresse». The build writes the `CNAME` file;
at your domain provider add a CNAME record pointing to `hydrosuisse.github.io`, and enter the domain
under **Settings → Pages → Custom domain**.

### API keys for own data sources

Never in the story: create a secret in the repository (e.g. `ENTSOE_TOKEN`), add it in
`.github/workflows/build-deploy.yml` under `env:` (the line for `ENTSOE_TOKEN` is already there), and in
the studio write `{SECRET}` in the data address at the place of the key and enter the name of the secret.
