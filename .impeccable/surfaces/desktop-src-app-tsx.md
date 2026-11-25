---
version: 1
slug: "desktop-src-app-tsx"
primary_target: "desktop/src/App.tsx"
related_targets: ["mobile/lib/main.dart"]
---

# Surface: Cynote editor (Windows app main window + Android editor)

Scope: the main note window on Windows (tabs, editor, find, status bar, settings view) and the Android note list, editor and settings. Mode: Operate. Build path: code-led.

Audience and task: someone mid-task presses Ctrl+Shift+Space, jots or edits plain text with VS Code shortcuts, closes, and later reads the same note on the phone. Constraints: plain text only, pt-BR copy without em dashes, light and idle-quiet, existing notes and drawings must survive. The owner asked for no questions; the direction below was taken from the roll unattended.

Unresolved: Android captures need an emulator build (JDK 21 missing on this PC); web builds stand in for layout review only.

## Direction contract

THESIS: Cynote is a steno pad you summon over your work. The note is the whole window, every line of text rests on its own printed rule at one fixed pitch, and editing behaves like VS Code. It refuses the dark code-editor clone and its opposite, the cream paper notebook.

OWN-WORLD: Steno pad. Light: pale steno-green paper, rules in soft green-grey, graphite ink, one ballpoint blue reserved for where you are (caret, current line's rule, active tab, focus, selection), one red margin rule that also marks destructive and error. Dark: graphite-green page, darker rules, chalk ink, lighter ballpoint. Shell is the pad's card: tab strip one step darker than the page, status bar in deep cover green with pale text. Note text in one bundled mono at a fixed pitch; chrome in the platform sans; at most three UI sizes. No button chrome, no gradients, no ornament.

STORY: The visitor sees the last note with the caret on its line, types with the shortcuts they know, switches notes by tab or Ctrl+P, and reads in the status bar where they are and whether the phone already has it.

FIRST VIEWPORT: Windows, 900x600: a 36px strip with note tabs left and window controls right; below it the page: 48px gutter of line numbers, the red margin rule, text 16px past it, rules every line pitch across the whole page down to the bottom edge; a 24px green status bar with Ln/Col, selection count, sync state and zoom. The primary action is typing: caret on line 1, focused on open.

FORM: grounded candidate 3 of 7 (steno pad), seed:f0bee13671bcad94. Signature move: the rule under the caret's line inks ballpoint blue, and every glyph sits on its rule because the pitch never varies. Raises: from airport wayfinding, blue is spent only on location; from Metro tiles, tone instead of borders and no button chrome; from the acetate manual, one size does the work for the note.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
