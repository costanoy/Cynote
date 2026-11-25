import type { ReactNode } from "react";

export type DialogButton = {
  label: string;
  kind?: "primary" | "danger";
  onClick: () => void;
};

type Props = {
  /** Kept for callers; the plain dialog no longer draws an emblem. */
  icon?: "unsaved" | "pair" | "update";
  title: string;
  children: ReactNode;
  buttons?: DialogButton[];
  /** Shows an indeterminate bar instead of buttons, while an update installs. */
  progress?: boolean;
};

export function Dialog({ title, children, buttons = [], progress }: Props) {
  const primary = buttons.find((b) => b.kind === "primary");
  return (
    <div className="dialog-scrim">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Enter" && primary && !(e.target instanceof HTMLButtonElement)) primary.onClick();
        }}
      >
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        {progress && (
          <div className="dialog-progress" role="progressbar" aria-label="Instalando">
            <div />
          </div>
        )}
        {buttons.length > 0 && (
          <div className="dialog-actions">
            {buttons.map((b) => (
              <button
                key={b.label}
                className={"btn" + (b.kind ? " " + b.kind : "")}
                onClick={b.onClick}
                autoFocus={b.kind === "primary"}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
