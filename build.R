# Build the whole site into _site/  (run locally or by GitHub Actions)
#   Rscript build.R
# Preview: python3 -m http.server -d _site   (then open http://localhost:8000)
#
# Two ways to write the story:
#   * Storymap-Studio: content/story.json + content/quellen.bib  -> _site/de/, _site/fr/, …
#   * by hand:         index.Rmd                                  -> _site/index.html
# If content/story.json exists, the studio files are used.

Sys.setlocale("LC_CTYPE", "C.UTF-8")
options(encoding = "UTF-8")
source("R/bfe_charts.R", encoding = "UTF-8")

unlink("_site", recursive = TRUE)
dir.create("_site/charts", recursive = TRUE)

# 1) BFE charts: fresh data (fallback: data/snapshot/), one page each ----------
speicher <- bfe_data("v2/fuellungsgrad-speicherseen")
bfe_chart_page(bfe_speicherseen_chart(speicher), "_site/charts/speicherseen.html",
               title = "Füllstände der Speicherseen",
               updated = speicher$totalCH$currentEntry$date)

produktion <- bfe_data("strom-produktion-import-verbrauch")
bfe_chart_page(bfe_produktion_handel_chart(produktion, years = 5), "_site/charts/produktion.html",
               title = "Landesproduktion, Landesverbrauch und Aussenhandel",
               updated = produktion$currentEntry$date)
bfe_chart_page(bfe_produktion_chart(produktion, years = 5), "_site/charts/produktion_bfe.html",
               title = "Stromproduktion nach Energieträger",
               updated = produktion$currentEntry$date)

# 2) Story ---------------------------------------------------------------------
copy_dir <- function(d) if (dir.exists(d)) invisible(file.copy(d, "_site", recursive = TRUE))

if (file.exists("content/story.json")) {
  suppressPackageStartupMessages({ library(mapgl); library(sf) })
  source("R/storymap.R", encoding = "UTF-8")
  source("R/studio_charts.R", encoding = "UTF-8")
  source("R/studio_build.R", encoding = "UTF-8")
  studio_build("content/story.json", "content/quellen.bib", site = "_site")
  copy_dir("assets"); copy_dir("media")
  message("Done: _site/<Sprache>/index.html")
} else {
  rmarkdown::render("index.Rmd", quiet = TRUE, encoding = "UTF-8")
  invisible(file.rename("index.html", "_site/index.html"))
  invisible(file.copy("libs", "_site", recursive = TRUE)); unlink("libs", recursive = TRUE)
  copy_dir("assets")
  message("Done: _site/index.html")
}
