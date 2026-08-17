import { useEffect, useRef } from "react";

type Props = {
  body: string;
  sketches: number[];
  spellCheck: boolean;
  onBodyInput: (value: string) => void;
};

export function ContentArea({ body, sketches, spellCheck, onBodyInput }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Set the initial text once on mount only. The div is intentionally left
  // uncontrolled after that — React must never touch its text content again,
  // or the caret resets to the start on every keystroke (looks like typing
  // "backwards" and stuck on the first line).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = body;
    el.focus();
    // Land the caret at the end of any existing text rather than the start,
    // so switching tabs (or opening a fresh blank one) is ready to type into.
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck={spellCheck}
        className="note-body"
        // innerText reports line breaks as "\r\n" on Windows, which counts as
        // 2 characters per Enter press instead of 1 - normalize to "\n".
        onInput={(e) => onBodyInput(e.currentTarget.innerText.replace(/\r\n/g, "\n"))}
      />

      {sketches.length > 0 && (
        <div className="sketches-row">
          {sketches.map((id) => (
            <div key={id} className="sketch-thumb">
              sketch
            </div>
          ))}
        </div>
      )}
    </>
  );
}
