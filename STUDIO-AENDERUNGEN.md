# Changes for the Storymap-Studio (this zip)

New files (copy as they are):
- R/studio_build.R, R/studio_charts.R
- tools/cite.mjs, tools/cite-render.mjs
- studio-start/content/story.json, studio-start/content/quellen.bib  (your story, converted – see README «Switching to the studio»)

Replaced files:
- build.R – also builds produktion_bfe.html; builds the studio version if content/story.json exists, otherwise index.Rmd as before
- .github/workflows/build-deploy.yml – also builds on branch «entwurf» (preview), node for citations
- README.md – new section «Storymap-Studio»

Changed files (if you have edited them yourself, apply only these additions):
- R/storymap.R – sm_map() gets terrain = NULL, exaggeration = 1.3 (3D terrain for inline maps)
- R/bfe_charts.R – bfe_chart_page() gets source_name and source_url (defaults: BFE as before)
- assets/storymap.js – typography per language (fr-CH/de-CH) replaces the old initTypography(); new: initVideos(), initLangSwitch(), initMaps()
- assets/storymap.css – block «Storymap-Studio blocks» appended at the end (tables, video, language switch, references)

index.Rmd is not touched.
