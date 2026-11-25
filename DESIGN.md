---
name: Cynote
description: A steno pad you summon over your work, ruled, plain text, the same page on Windows and Android.
colors:
  page: "#edf2e8"
  page-2: "#e1e8db"
  page-3: "#d6dfd0"
  rule: "#cbd9c6"
  edge: "#c3cfbe"
  ink: "#262b27"
  ink-soft: "#59625a"
  ink-faint: "#67716a"
  accent: "#2350c0"
  on-accent: "#ffffff"
  accent-soft: "rgba(35, 80, 192, 0.12)"
  selection: "rgba(35, 80, 192, 0.2)"
  margin: "#c9463d"
  margin-ink: "#b23a31"
  amber: "#b7791f"
  match: "rgba(214, 160, 52, 0.32)"
  match-current: "rgba(214, 160, 52, 0.62)"
  cover: "#2f5240"
  cover-ink: "#e6efe4"
  cover-hover: "rgba(230, 239, 228, 0.14)"
  cover-alert: "#ffd27a"
  cover-alarm: "rgba(201, 70, 61, 0.55)"
  ok: "#3f8a5c"
  hover: "rgba(38, 43, 39, 0.06)"
  pressed: "rgba(38, 43, 39, 0.11)"
  scrim: "rgba(24, 32, 27, 0.28)"
  close-hover: "#c42b1c"
  page-dark: "#18201b"
  page-2-dark: "#111713"
  page-3-dark: "#0c110e"
  rule-dark: "#26312a"
  edge-dark: "#2d3a31"
  ink-dark: "#dce5da"
  ink-soft-dark: "#9aa79b"
  ink-faint-dark: "#7c8a7f"
  accent-dark: "#7fa2ff"
  on-accent-dark: "#0b1430"
  margin-dark: "#e0766c"
  margin-ink-dark: "#e98a81"
  amber-dark: "#d9a441"
  cover-dark: "#2b4d3b"
  cover-ink-dark: "#cfe0d2"
  cover-alarm-dark: "rgba(224, 118, 108, 0.45)"
  ok-dark: "#5fae7c"
typography:
  note:
    fontFamily: "JetBrains Mono, Cynote Emoji, Cynote Symbol, Cynote Text, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0"
    fontFeature: "\"liga\" 0, \"calt\" 0"
  note-android:
    fontFamily: "JetBrainsMono"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "0"
    fontFeature: "\"liga\" 0, \"calt\" 0"
  title:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  label-android:
    fontFamily: "Roboto"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.4px"
    fontFeature: "\"tnum\" 1"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  sheet-android: "12px"
spacing:
  band: "24px"
  strip: "36px"
  control: "28px"
  control-small: "24px"
  gutter: "48px"
  text-inset: "16px"
  gutter-android: "24px"
  text-inset-android: "36px"
components:
  button:
    backgroundColor: "{colors.page-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "{spacing.control}"
  button-hover:
    backgroundColor: "{colors.page-3}"
  button-active:
    backgroundColor: "{colors.pressed}"
  button-primary:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "{spacing.control}"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #2f5240 86%, #262b27)"
  button-danger:
    backgroundColor: "{colors.page-2}"
    textColor: "{colors.margin-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "{spacing.control}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    width: "30px"
    height: "{spacing.control}"
  icon-button-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  text-input:
    backgroundColor: "{colors.page-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "{spacing.control}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    typography: "{typography.body}"
    padding: "0 6px 0 14px"
    height: "{spacing.strip}"
  tab-active:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
  menu:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.md}"
    padding: "4px"
  menu-item-highlight:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    height: "{spacing.control}"
  status-band:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
    typography: "{typography.label}"
    height: "{spacing.band}"
  dialog:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    padding: "18px 20px 16px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  fab-android:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.cover-ink}"
---

# Design System: Cynote

## Overview

**Creative North Star: "The Steno Pad"**

Cynote is a top-bound steno pad you summon over whatever you are doing. The note is the whole window: pale steno-green paper, a printed rule under every line at one fixed pitch, a red margin rule down the left, graphite ink, and one ballpoint blue that only ever says where you are. Around the page sits the pad's card and cover: a title strip one tone darker than the page, and a deep cover-green band at the foot carrying the note's facts (line, column, characters, sync, zoom). Editing behaves like VS Code; the look refuses both the dark code-editor clone and the cream paper notebook.

The system is quiet and dense in the way a good tool is. Controls are tone on tone, not boxes; there is no gradient, no ornament, no button chrome. Type is split cleanly: the note in one bundled monospace at an integer pitch, everything else in the platform sans (Segoe UI on Windows, Roboto through Material 3 on Android) at no more than three sizes per screen. Both apps share one token set by name and value (`desktop/src/theme.css`, `mobile/lib/theme.dart` `CyColors`), and each follows its own platform's controls on top of it.

This world replaced the retired Art Nouveau greenhouse look. Compatibility aliases from that look (`--gold`, `--petrol`, `--glass-*`, `LogoMedallion`, `Leaf`, `Bud`) still resolve to steno-pad tokens so unrebuilt code compiles; they are not part of the system.

**Key Characteristics:**
- One integer line pitch for every line of note text, rules drawn at that pitch to the bottom edge of the page.
- Ballpoint blue is spent only on location.
- Margin red is both the margin rule and the destructive/error color.
- Cover green is the status band, the primary action and the brand mark's ground.
- Tone instead of borders for Windows controls; three interface sizes at most.
- Light and dark are the same pad: graphite-green page, chalk ink, lighter ballpoint.

## Colors

A pale green paper palette with three inks that each mean one thing: blue for where you are, red for the margin and for danger, green for the cover.

### Primary
- **Ballpoint Blue** (`accent`; dark `accent-dark`): the caret, the rule under the caret's visual row, the 2px rule on top of the active tab, focus outlines and focused input borders, the text selection (`selection`, a translucent tint of the same blue), the ring around the current find match, the highlighted row of an open menu, and the selected drawing's dashed outline and resize handle. Nowhere else.

### Secondary
- **Cover Green** (`cover`; dark `cover-dark`): the status band at the foot of every window (main window, Dashnotes, the Android editor), the primary button, the Android FAB and filled buttons, the drawing-mode frame (a 2px inset line around the page while drawing), the indeterminate progress bar, and the ground of the app mark. Text on it is **Cover Ink** (`cover-ink`). Warnings shown on the cover use **Cover Alert** (`cover-alert`), a warm yellow that reads on green.

### Tertiary
- **Margin Red** (`margin`; dark `margin-dark`): the 1px vertical margin rule between the line-number gutter and the text. The same red, as **Margin Ink** (`margin-ink`, darkened for text contrast), marks destructive actions (danger buttons and links, delete in the drawing toolbar), errors, "no results" in find, and denied or failed sync. Material's `error` on Android is this color.
- **Highlighter Amber** (`amber`, `match`, `match-current`): found things that are not where you are. Other occurrences of the selected word and find matches are amber tints; offline sync is an amber dot.

### Neutral
- **Steno Page** (`page`): the note page, menus, dialogs, the active tab (cut from the page so it opens onto it).
- **Card** (`page-2`): the title strip, buttons and text inputs at rest, the find widget, drawing dock, app bars, sheets and dialogs on Android.
- **Card Pressed** (`page-3`): button hover.
- **Printed Rule** (`rule`): the rule under every row of note text, settings and list row separators, progress track.
- **Edge** (`edge`): hairlines that separate surfaces, never controls: tab separators, menu and popover outlines, title-strip separators, keycaps.
- **Graphite** (`ink`), **Pencil** (`ink-soft`), **Faint Pencil** (`ink-faint`): text, secondary text and icons, line numbers and placeholders. `ink` also fills a switch that is on, the toast, and Material's `primary` on Android.
- **Hover / Pressed** (`hover`, `pressed`): translucent graphite washes for every Windows control state; `pressed` also marks a toggled tool.

### Named Rules
**The Ballpoint Rule.** Blue is spent only on location: caret, cursor rule, active tab rule, focus, selection, current match, the highlighted menu row. A test: if the element would still be blue when the user is not on it, it is wrong. Android maps Material `primary` to ink and the filled button to the cover precisely so blue never leaks onto a control.

**The Margin Doubles Rule.** The red that rules the margin is the only destructive and error color. There is no second red, except Windows' own caption close hover (`close-hover`), which belongs to the platform.

**The Cover Rule.** Cover green is the status band and the primary action, and nothing decorative. One primary action per view.

## Typography

**Note Font:** JetBrains Mono 400 (bundled on Android; on Windows with Segoe UI Emoji, Segoe UI Symbol and Segoe UI fallbacks remapped to JetBrains Mono's ascent and descent, then Consolas)
**Interface Font:** Segoe UI Variable Text / Segoe UI on Windows; Roboto through the Material 3 type scale on Android

**Character:** A plain mono that types like a code editor without looking like one, held to the page's rules; the chrome stays in the platform's own voice so the app feels native on each system.

### Hierarchy
- **Note** (400, 14px on a 24px pitch on Windows at 100%; 15px on a 26px pitch on Android): all note text. Ligatures and contextual alternates off, so `->` stays two characters. Zoom changes `--text-size` and `--pitch` together, both whole pixels.
- **Title** (600, 18px, 1.2; Windows): the settings page title and dialog titles. On Android, Material `titleLarge` for app bars and dialogs.
- **Body** (400, 13px, 1.4; Windows): tab labels, buttons, menu items, inputs, settings labels. Section headings use the same size at 600. On Android, `bodyLarge`/`titleMedium` for list titles and menus.
- **Label** (400, 12px; Windows): status band, hints, menu shortcut keys, find widget text, list metadata, toasts. On Android `labelSmall` is raised to 12px with tabular figures, and `bodySmall` carries previews.

### Named Rules
**The Three Sizes Rule.** At most three interface sizes per screen (Windows: 12, 13 and 18px via `--fs-s`, `--fs-m`, `--fs-l`). The note has its own size and does not count. Emphasis is weight (600) or ink tone, never a fourth size.

**The One Pitch Rule.** Every line of note text, wrapped or not, emoji or not, is exactly one integer pitch tall on both apps. Windows fixes it with `line-height: var(--pitch)` and fallback fonts overridden to the mono's metrics; Android fixes it with a forced strut (`CyNoteType.strut`). Nothing may make a row a fractional height.

**The Tabular Figures Rule.** Numbers that change in place (Ln/Col, counts, zoom, dates, line numbers) use tabular figures.

## Layout

The Windows main window is a three-row grid: a 36px title strip (app mark as menu button, note tabs, tool icons, Windows caption buttons), the page, and a 24px status band. The page has a 48px line-number gutter (47px plus the 1px margin rule; 24px when numbers are off), then text 16px past the margin. Rules run edge to edge, including under the scrollbar, and down to the bottom of the window even past the last line. Reading mode centers one 84ch column without numbers. Settings is a single 560px column of plain rows (min 44px, separated by rules). Dashnotes lists one item per ruled row (min 34px) under a 40px breadcrumb bar. Below 560px window width, secondary status items and zoom hide.

On Android the editor page puts the margin rule at 24dp and the text at 36dp, 16dp from the right, with rules every 26dp to the bottom and the cover band at the foot. The note list is plain rows on the page separated by a rule, with the cover-green FAB for a new note. The Android review captures (`.impeccable/review/mobile/`) came from a Flutter web build, not an emulator, so they confirm layout and color only; device font rendering, pixel snapping of the rules and system bars are unverified.

Spacing is small and functional: controls 28px (24px small), 2 to 8px gaps inside groups, 4px menu padding.

## Elevation & Depth

The pad itself is flat: page, card strip and cover are tonal layers with no shadow, and the window's own shadow and rounded corners come from Windows 11 (the window is opaque for ClearType). Shadows appear only on things that float over the page, and only as soft graphite-green ambient shadows built from `--shadow`.

### Shadow Vocabulary
- **Menu** (`box-shadow: 0 8px 24px var(--shadow), 0 1px 3px var(--shadow)`): main menu, tabs menu.
- **Find widget** (`box-shadow: 0 6px 18px var(--shadow)`): hangs from the top edge of the page, top border open.
- **Drawing dock / toolbar** (`0 8px 22px var(--shadow)`; small toolbar `0 4px 12px var(--shadow)`).
- **Toast** (`0 6px 20px var(--shadow)`).
- **Dialog** (`0 18px 48px var(--shadow), 0 2px 6px var(--shadow)`) over the `scrim`.

### Named Rules
**The Flat Pad Rule.** Nothing that is part of the pad (strip, page, band, rows) casts a shadow. Only what floats over the page does. Android removes Material's surface tint everywhere for the same reason.

## Shapes

Small, honest corners: 3px for find inputs and toolbar buttons, 4px for buttons, inputs, menu rows and tab close buttons, 6px for menus, the find widget, docks and toasts, 8px for dialogs. Tabs and the status band are square, like the pad's card and cover. Android keeps Material 3 shapes (stadium chips, the FAB's rounded square, 12dp sheets and setting cards). The app mark is a rounded cover-green square (radius 14 on a 64 grid) with spiral coils across the top edge, two pale rules, the ballpoint rule and the red margin, authored once in `desktop/icon-source/cynote-mark.svg` and `generate-brand-icons.mjs`. Interface icons on Windows are a single 16px set with a 1.5 stroke, rounded caps and joins, `currentColor`; on Android, Material Symbols outlined at one weight.

## Components

### Buttons
Tone, not chrome.
- **Shape:** gently squared (4px), 28px tall, 12px side padding; small is 24px with 12px text.
- **Default:** card tone (`page-2`) with graphite text, a transparent 1px border reserved so variants never shift. Hover deepens to `page-3`, active to `pressed`.
- **Primary:** cover green with cover ink, weight 600; hover and active mix 14% and 26% graphite into the green.
- **Danger:** card tone with margin-ink text; hover tints with 14% margin red.
- **Link:** no box, graphite text with a 35% underline that firms on hover; a danger link is margin-ink.
- **Focus:** 2px ballpoint outline, 1px offset.
- **Icon buttons:** 30x28, transparent, pencil-colored icon; hover shows the `hover` wash, pressed/toggled shows `pressed` with graphite icon. Windows caption buttons are 46x36 and the close hover is the system red.
- **Android:** FilledButton is the cover; OutlinedButton is a faint-pencil outline with ink text; TextButton is ink.

### Inputs / Fields
- **Style:** card tone, 4px radius, 28px tall, transparent border at rest, ballpoint caret.
- **Focus:** border and a 1px ring in ballpoint blue. Mono inputs (sync codes) use the note font at 12px.
- **Android:** Material outlined field; focused border ballpoint at 2dp, error in margin red.

### Navigation (tabs)
Note tabs sit flat in the title strip like an editor's. Each tab is separated by an edge hairline, pencil text, hover wash. The active tab is cut from the page (page tone, no seam below) and carries a 2px ballpoint rule on its top edge. An unsaved note shows a dot where the close button lives; hovering swaps them.

### Menus
Page-toned popover, 1px edge outline, 6px radius, menu shadow, 4px padding. Rows are 28px with 4px corners; the highlighted row (hover or keyboard focus) fills with ballpoint blue and on-accent text. Shortcut keys sit right in faint pencil at 12px. Headings are 12px 600 in faint pencil, sentence case.

### Status Band (signature)
The pad's cover at the foot of every window: cover green, cover ink, 12px, 24px tall, items 8px apart with a `cover-hover` wash on hover. Left: sync state; right: Ln/Col, selection or character count, wrap toggle, zoom. Offline, denied or failed sync turns the sync icon `cover-alert`; denied or failed also tints the item with `cover-alarm` (margin red on the cover). In Settings the synced state is an `ok` green dot.

### The Ruled Page (signature)
The editor (CodeMirror 6) is the steno page: rules as backgrounds sized to `--pitch`, sitting a twelfth of a pitch up so text rests just above them (`--rule-offset`). The rule under the caret's visual row (one wrapped row, not the whole logical line) is drawn as a separate layer in ballpoint blue across margin and page, only while the note has focus; with several cursors, each row gets one. Line numbers in faint pencil, the current one in graphite. The caret is a 2px ballpoint bar. Android paints the same rules, margin and caret row with `_RulesPainter`, snapped to device pixels.

### Find Widget
Floats at the top right of the page, hanging from its top edge (no top border, 6px bottom corners), card tone, 12px text. Inputs are page tone with ballpoint focus. Toggles are tone; an active toggle shows `pressed` with a pencil inset ring. "No results" is margin-ink. Matches are amber; the current match is a ballpoint ring.

### Dialogs and Toasts
Dialogs: page tone, edge outline, 8px radius, 18px title, 13px body in pencil, actions right-aligned (primary is cover green). Toasts: graphite with page-colored text, 12px, a single underlined action.

### Drawing Dock
While drawing, the page gets a 2px cover-green inset frame and a card-toned dock at the bottom (tools as tone, size dots, color swatches with a graphite ring when active). The selected drawing shows a dashed ballpoint outline and a ballpoint resize handle.

## Do's and Don'ts

### Do:
- **Do** keep every line of note text at one integer pitch on both apps; change `--text-size` and `--pitch` together, in whole pixels.
- **Do** spend ballpoint blue only on location: caret, cursor rule, active tab rule, focus, selection, current match, highlighted menu row.
- **Do** use margin red (`margin` / `margin-ink`) for every destructive action and error.
- **Do** put the note's facts and sync state on the cover-green status band, and make the cover the one primary action.
- **Do** build Windows controls from tone (`page-2`, `page-3`, `hover`, `pressed`), with `edge` hairlines only between surfaces.
- **Do** keep each screen to three interface sizes; use weight or ink tone for emphasis.
- **Do** keep token names and values identical between `theme.css` and `CyColors`.

### Don't:
- **Don't** color a control, icon or link blue because it is clickable; Android `primary` stays ink.
- **Don't** give Windows buttons visible borders, gradients or bevels.
- **Don't** add a second red, a fourth interface size, or a line height that is not the pitch.
- **Don't** shadow anything that is part of the pad (strip, page, band, rows).
- **Don't** let ligatures or fallback glyphs change the note's metrics.
- **Don't** reintroduce the retired greenhouse ornaments (vines, arches, medallions, leaves); their aliases exist only so old code compiles.
