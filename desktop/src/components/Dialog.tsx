import type { ReactNode } from "react";
import { DrawIcon, PhoneIcon, UpdateIcon } from "../icons";

export type DialogButton = {
  label: string;
  kind?: "primary" | "danger";
  onClick: () => void;
};

type Props = {
  icon: "unsaved" | "pair" | "update";
  title: string;
  children: ReactNode;
  buttons?: DialogButton[];
  /** Shows the growing green bar instead of buttons, while an update installs. */
  progress?: boolean;
};

/** A paper plaque over a scrim, crowned by a medallion. */
export function Dialog({ icon, title, children, buttons = [], progress }: Props) {
  return (
    <div className="dialog-scrim">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-halo">
          <div className="dialog-halo-disc">
            {icon === "unsaved" && <DrawIcon size={20} width={1.3} />}
            {icon === "pair" && <PhoneIcon />}
            {icon === "update" && <UpdateIcon />}
          </div>
        </div>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        {progress && (
          <div className="dialog-progress">
            <div />
          </div>
        )}
        {buttons.length > 0 && (
          <div className="dialog-actions">
            {buttons.map((b) => (
              <button
                key={b.label}
                className={"pill dialog-btn" + (b.kind ? " " + b.kind : "")}
                onClick={b.onClick}
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
