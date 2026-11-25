# Product

<!-- impeccable:product-schema 1 -->

> Written 2026-11-25 without an interview: the owner asked not to be asked ("Não me pergunte, só altere"). Facts come from the repository (README, code) and the owner's request; lines marked *(inferido)* are inferences to confirm later.

## Platform

adaptive

The Windows app is web technology inside Tauri 2 (React + TypeScript, `desktop/`). The Android app is native Flutter (`mobile/`). Each follows its own platform's conventions while sharing one identity.

## Users

The owner, Vinícius, and people like him: someone who writes short notes all day on a Windows PC and wants them on the phone too *(inferido)*. They know VS Code well and expect its editing shortcuts to work everywhere they type.

## Product Purpose

Cynote is a plain-text notepad that hides in the Windows tray and appears instantly with Ctrl+Shift+Space: write, close, move on, and the note is on the phone. Success is the user never thinking about where a note is, and never preferring another app (the owner named Memoras as the easier alternative he would fall back to).

## Positioning

A notepad you summon from anywhere, with VS Code-grade text editing, that still feels as light as a scratch pad, and that syncs Windows and Android without an account, ads or subscription.

## Operating Context

- Lives in the Windows tray; global hotkey; can stay pinned on top of other windows; closing hides it.
- Several notes open as tabs; notes are files on disk (`.cyte`, `.txt`, `.md`); a second window, Dashnotes, browses the notes on the computer by folder.
- Note Styling: the user can draw over a note (pen, highlighter, eraser) and move or resize the drawing; drawings are saved inside `.cyte` files.
- Android app with a note list, search, sort, editor and settings.
- Both apps update themselves (GitHub releases).

## Capabilities and Constraints

- Text is plain text. No rich formatting.
- Interface language is Brazilian Portuguese. Texts never use the em dash (travessão).
- Must stay light: nothing should render, animate or poll while the window is hidden or idle.
- Editing must offer what VS Code users expect: multiple cursors, select next occurrence, column selection, find and replace, go to line, move and copy lines, zoom.
- Sync between Windows and Android must be simple and reliable. The owner judged the previous LAN + cloud sync "péssima"; simplicity beats cleverness.
- Existing users' notes and drawings must survive every change.

## Brand Commitments

- Name: Cynote, made by Cyberhat (cyberhat.com.br). Site: cynote.cyberhat.com.br.
- The previous visual world (Art Nouveau greenhouse: arches, lamps, leaves, Marcellus and Literata, "estufa" day and night themes) is explicitly retired by the owner as exaggerated. It is an anti-reference.
- VS Code is the owner's reference for editing behavior and for how light the app should feel. It sets the craft bar, not the look.
- The owner allowed changing the logo and marketing art (Canva may be used).

## Evidence on Hand

- README.md (features, sync description), docs/ (the product site), brand-assets/ (current logo files), design_handoff_cynote_art_nouveau/ (the retired world).
- No testimonials, user counts or benchmarks exist; none may be invented.

## Product Principles

1. The text is the interface. Chrome stays out of the way of the note.
2. Instant and idle-quiet: open fast, use almost nothing when hidden.
3. Keyboard-grade editing with the shortcuts people already know.
4. Sync is invisible and dependable; one simple path beats several clever ones.
5. One note, everywhere: the same note looks and behaves the same on Windows and Android.

## Accessibility & Inclusion

Full keyboard operation on Windows; WCAG AA contrast in both themes; follows the OS reduced-motion and text-size settings *(inferido)*.
