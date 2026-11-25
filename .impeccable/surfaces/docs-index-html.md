---
version: 1
slug: "docs-index-html"
primary_target: "docs/index.html"
related_targets: ["docs/assets/site.css"]
---

# Surface: Cynote product site (cynote.cyberhat.com.br)

Scope: the one-page product site in `docs/` (index.html, assets/). Mode: Persuade. Build path: code-led (no harness image generation for comps; the owner asked for no questions, so the dealt lead was taken unattended).

Audience and action: someone who writes short notes all day on a Windows PC and wants them on the phone; they decide in one viewport and download for Windows or Android (GitHub releases). Proof on hand: the app itself (its CodeMirror extensions run in the page), the real sync rules (SYNC.md), the app's own copy. No testimonials, counts or benchmarks exist; none may be invented. Copy in pt-BR, no em dashes.

Constraints: inherit DESIGN.md's steno pad exactly (tokens, Ballpoint, Margin, Cover, Flat Pad, Three Sizes, One Pitch rules). The retired greenhouse look (arches, gold, vines, medallions, Marcellus, Literata) is an anti-reference. Sync is internet only with one code; no LAN, mDNS or pairing may be described.

Unresolved: og-image is rendered from the site's own tokens, not from Canva; a Canva version can follow if the owner wants one.

## Direction contract

THESIS: The site is a Cynote window. The browser viewport is the app: a card strip on top whose tabs are the sections, one steno page ruled at a single pitch down the whole document with the red margin, a cover-green band held at the foot. Headlines are note lines written on that page. It refuses the split hero with a screenshot and the row of feature cards.

OWN-WORLD: DESIGN.md's steno pad unchanged: page green ruled at one integer pitch, red margin rule, graphite ink, ballpoint blue only for location (current section tab, caret, caret rule, focus, selection), cover green only for the band and the one primary action, amber for found things. JetBrains Mono for every line that is note text (headlines, demos); platform sans for the rest; two interface sizes. Tone instead of borders, no cards, no gradients; only things floating over the page cast a shadow.

STORY: The visitor reads "Suas notas, a um atalho de distância." as the first lines of a note, types a line and watches it reach the phone lying beside it, tries Ctrl+D and Alt+↑ in the app's real editor, learns the one-code sync as it really works, and downloads for Windows or Android.

FIRST VIEWPORT: 1440x900. 48px card strip: mark and name, section tabs (blue top rule on the current one), theme, GitHub, and a Baixar that steps aside while a cover download button is on screen (one primary per view). Page ruled every 40px (32px on phones), gutter numbers 1 to 4 left of the red margin at max(72px, 50vw - 600px); headline in 34px mono on rows 1 and 2, an editable demo line with the ballpoint caret on row 4, a hint on row 5, the lead on rows 7 to 9, Baixar para Windows (cover) and Baixar para Android on rows 11 and 12 (on phones Android is the cover one and comes first), facts on row 13. Right: an Android phone at true proportion, 15 rows tall, showing the same note under its cover band (on phones, a small Windows window below the actions). A 28px cover band fixed at the viewport foot reports the demo's sync state, Ln/Col and characters. Primary action: Baixar para Windows, rows 11 and 12.

FORM: grounded candidate 3 of 7 (two devices, one note), seed:9623e3e785471457. Signature interaction: typing on the page's note reaches the phone after a beat while both bands go Sincronizando… then Sincronizado; the Edição section runs the app's own CodeMirror extensions and keymap with its find widget and status band live. Motion grammar: one moment, the sync beat; everything else is still, and reduced motion keeps the beat as an instant swap.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
