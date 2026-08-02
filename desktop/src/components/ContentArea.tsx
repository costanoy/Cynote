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
    if (ref.current) ref.current.innerText = body;
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
        onInput={(e) => onBodyInput(e.currentTarget.innerText)}
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
