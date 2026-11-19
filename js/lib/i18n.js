// i18n.js — interface language of the studio (not of the story). German is complete;
// French and English cover the main navigation and actions; anything missing falls
// back to German. Add a language by adding a dictionary here.
const DICT = {
  de: {
    write: "Schreiben", blocks: "Bausteine", sources: "Quellen", credits: "Nachweise", translate: "Übersetzung",
    publish: "Veröffentlichen", preview: "Vorschau", save: "Speichern", saved: "Gespeichert", unsaved: "Ungespeicherte Änderungen",
    saving: "Speichert …", demo: "Demo (nur in diesem Browser)", chapters: "Kapitel", addChapter: "+ Kapitel hinzufügen",
    cover: "Titelbild & Einstellungen", auto: "Automatisch erstellt", insert: "Baustein einfügen", search: "Suchen …",
    back: "Zurück", done: "Fertig", remove: "Entfernen", language: "Sprache", uiLanguage: "Sprache der Oberfläche",
    logout: "Abmelden",
  },
  fr: {
    write: "Rédiger", blocks: "Blocs", sources: "Sources", credits: "Crédits", translate: "Traduction",
    publish: "Publier", preview: "Aperçu", save: "Enregistrer", saved: "Enregistré", unsaved: "Modifications non enregistrées",
    saving: "Enregistrement …", demo: "Démo (uniquement dans ce navigateur)", chapters: "Chapitres", addChapter: "+ Ajouter un chapitre",
    cover: "Couverture & réglages", auto: "Créé automatiquement", insert: "Insérer un bloc", search: "Rechercher …",
    back: "Retour", done: "Terminé", remove: "Supprimer", language: "Langue", uiLanguage: "Langue de l’interface",
    logout: "Se déconnecter",
  },
  en: {
    write: "Write", blocks: "Blocks", sources: "Sources", credits: "Credits", translate: "Translation",
    publish: "Publish", preview: "Preview", save: "Save", saved: "Saved", unsaved: "Unsaved changes",
    saving: "Saving …", demo: "Demo (this browser only)", chapters: "Chapters", addChapter: "+ Add chapter",
    cover: "Cover & settings", auto: "Created automatically", insert: "Insert block", search: "Search …",
    back: "Back", done: "Done", remove: "Remove", language: "Language", uiLanguage: "Interface language",
    logout: "Sign out",
  },
};
let ui = "de";
try { ui = localStorage.getItem("studio-ui-lang") || (navigator.language || "de").slice(0, 2); } catch (_) {}
if (!DICT[ui]) ui = "de";
export const uiLang = () => ui;
export function setUiLang(l) { ui = DICT[l] ? l : "de"; try { localStorage.setItem("studio-ui-lang", ui); } catch (_) {} document.documentElement.lang = ui; }
export const t = (k) => (DICT[ui] && DICT[ui][k]) || DICT.de[k] || k;
export const UI_LANGS = [["de", "Deutsch"], ["fr", "Français"], ["en", "English"]];
