import type { ReactNode } from "react";
import type { SyncStatus } from "./types";

type IconProps = { size?: number };

// Interface icons: 16x16 grid, rounded line ends, drawn in currentColor.
function Stroke({
  size,
  width,
  join,
  children,
}: {
  size: number;
  width: number;
  join?: boolean;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin={join ? "round" : undefined}
    >
      {children}
    </svg>
  );
}

export function MenuIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={1.5}>
      <path d="M3 5h10M3 8h10M3 11h6" />
    </Stroke>
  );
}

/** Note Styling: a quill. */
export function DrawIcon({ size = 14, width = 1.5 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width} join>
      <path d="M13.5 2.5C8 2.5 4.5 6.5 3 13.5" />
      <path d="M13.5 2.5C13.5 7 10.5 10 6 10.5" />
    </Stroke>
  );
}

export function SettingsIcon({ size = 15 }: IconProps) {
  return (
    <Stroke size={size} width={1.4}>
      <path d="M2 4h6.2M11.8 4H14M2 8h1.2M6.8 8H14M2 12h7.2M12.8 12H14" />
      <circle cx="10" cy="4" r="1.8" />
      <circle cx="5" cy="8" r="1.8" />
      <circle cx="11" cy="12" r="1.8" />
    </Stroke>
  );
}

export function PinIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size} width={1.5} join>
      <path d="M6 2h4l-.8 4 2.8 3H4l2.8-3z" />
      <path d="M8 9v5" />
    </Stroke>
  );
}

export function MinimizeIcon({ size = 10 }: IconProps) {
  return (
    <Stroke size={size} width={1.8}>
      <path d="M4 8.5h8" />
    </Stroke>
  );
}

/** Maximize: an arched window. */
export function MaximizeIcon({ size = 10 }: IconProps) {
  return (
    <Stroke size={size} width={1.6} join>
      <path d="M4 13.5V7.5a4 4 0 0 1 8 0v6z" />
    </Stroke>
  );
}

export function CloseIcon({ size = 10, width = 1.8 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
    </Stroke>
  );
}

export function PlusIcon({ size = 11 }: IconProps) {
  return (
    <Stroke size={size} width={2}>
      <path d="M8 3v10M3 8h10" />
    </Stroke>
  );
}

export function ChevronDownIcon({ size = 10 }: IconProps) {
  return (
    <Stroke size={size} width={2} join>
      <path d="M3.5 6l4.5 4.5L12.5 6" />
    </Stroke>
  );
}

export function ChevronRightIcon({ size = 10 }: IconProps) {
  return (
    <Stroke size={size} width={2} join>
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </Stroke>
  );
}

export function ArrowUpIcon({ size = 11 }: IconProps) {
  return (
    <Stroke size={size} width={1.8} join>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Stroke>
  );
}

export function ArrowDownIcon({ size = 11 }: IconProps) {
  return (
    <Stroke size={size} width={1.8} join>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </Stroke>
  );
}

export function BackIcon({ size = 12, width = 1.8 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width} join>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </Stroke>
  );
}

export function ReadingIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M1.5 3.8c2.3-1 4.5-.8 6.5 1 2-1.8 4.2-2 6.5-1v8.4c-2.3-1-4.5-.8-6.5 1-2-1.8-4.2-2-6.5-1z" />
      <path d="M8 4.8v8.4" />
    </svg>
  );
}

export function EditIcon({ size = 11 }: IconProps) {
  return (
    <Stroke size={size} width={1.6} join>
      <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
    </Stroke>
  );
}

export function TrashIcon({ size = 11 }: IconProps) {
  return (
    <Stroke size={size} width={1.6} join>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />
    </Stroke>
  );
}

export function RefreshIcon({ size = 13 }: IconProps) {
  return (
    <Stroke size={size} width={1.6} join>
      <path d="M13 8a5 5 0 1 1-1.5-3.6" />
      <path d="M13 2.5v2.8h-2.8" />
    </Stroke>
  );
}

export function PhoneIcon({ size = 20 }: IconProps) {
  return (
    <Stroke size={size} width={1.3} join>
      <rect x="4.5" y="1.5" width="7" height="13" rx="1.8" />
      <path d="M7 12.2h2" />
    </Stroke>
  );
}

export function UpdateIcon({ size = 20 }: IconProps) {
  return (
    <Stroke size={size} width={1.3} join>
      <path d="M2 12.5h12" />
      <path d="M4.5 12.5a3.5 3.5 0 0 1 7 0" />
      <path d="M8 2v5M5.8 4.2L8 2l2.2 2.2" />
    </Stroke>
  );
}

/** Drag handle: six dots. */
export function GripIcon() {
  return (
    <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor">
      <circle cx="1.5" cy="2" r="1" />
      <circle cx="4.5" cy="2" r="1" />
      <circle cx="1.5" cy="6" r="1" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="1.5" cy="10" r="1" />
      <circle cx="4.5" cy="10" r="1" />
    </svg>
  );
}

// ------------------------------------------------------------ ornaments

/** The in-app mark: a gold "C" in a double ring, with a leaf. (The full logo
 * is only used for the app/tray icon, never inside the interface.) */
export function LogoMedallion() {
  return (
    <div className="cy-logo">
      <span>C</span>
      <svg width="8" height="8" viewBox="-4 -4 8 8">
        <path
          d="M0 -3.5 C2.6 -1.8 2.6 1.8 0 3.5 C-2.6 1.8 -2.6 -1.8 0 -3.5 Z"
          fill="var(--accent)"
          transform="rotate(35)"
        />
      </svg>
    </div>
  );
}

/** The arched iron header shape, shared by the main window and Dashnotes. */
export function ArchShape() {
  return (
    <svg className="cy-arch-shape" viewBox="0 0 600 56" preserveAspectRatio="none">
      <path
        className="iron"
        d="M0 56 V22 Q0 11 14 11 H190 C245 11 262 1 300 1 C338 1 355 11 410 11 H586 Q600 11 600 22 V56 Z"
      />
      <path
        className="fillet"
        d="M14 14.5 H190 C245 14.5 262 4.5 300 4.5 C338 4.5 355 14.5 410 14.5 H586"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function ArchVines() {
  return (
    <svg className="cy-arch-vines" width="132" height="16" viewBox="0 0 132 16">
      <path
        d="M58 8 C50 2 40 13 30 8 C24 5 21 10 25 11.5 M74 8 C82 2 92 13 102 8 C108 5 111 10 107 11.5"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d="M40 9.5 C37 6.5 33 7 32 9 C35 10.5 38 10.5 40 9.5 Z M92 9.5 C95 6.5 99 7 100 9 C97 10.5 94 10.5 92 9.5 Z"
        fill="var(--gold)"
        opacity=".7"
      />
    </svg>
  );
}

export function CornerVignette({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  return (
    <svg className={"cy-vignette " + corner} width="22" height="22" viewBox="0 0 22 22">
      <path d="M3 21 V11 C3 6.5 6.5 3 11 3 H21 M3 14 C6.5 14 8.5 11 7.5 8.8 C6.8 7.4 5 7.8 5.4 9.3" />
    </svg>
  );
}

export function Sprout({ size = 44 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      <path d="M20 35 C20 28 20 22 20 15" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M20 23 C13 23 8.5 18 8.5 13 C14.5 13 20 17 20 23 Z M20 18.5 C26 18.5 31.5 13.5 31.5 8.5 C25 8.5 20 12.5 20 18.5 Z"
        fill="var(--accent)"
        opacity=".75"
      />
      <path d="M9 35.5 C15 33 25 33 31 35.5" fill="none" stroke="var(--gold)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** A single leaf, used as a marker (line under the mouse, favorite, file type). */
export function Leaf({ size = 12, color = "var(--accent)", rotate = 0 }: IconProps & { color?: string; rotate?: number }) {
  return (
    <svg width={size} height={size} viewBox="-6 -6 12 12">
      <path d="M0 -5 C2.6 -2.4 2.6 2.4 0 5 C-2.6 2.4 -2.6 -2.4 0 -5 Z" transform={`rotate(${rotate})`} fill={color} />
    </svg>
  );
}

const OPEN_LEAVES =
  "M0 4 C-1.5 -1.5 -6 -4 -9.5 -3 C-8 2 -4 4.5 0 4 Z M0 4 C1.5 -1.5 6 -4 9.5 -3 C8 2 4 4.5 0 4 Z M0 4 C-2 -1 -1.4 -6 0 -9 C1.4 -6 2 -1 0 4 Z";

/** Three open leaves - "synced". */
export function OpenLeaves({ size = 14, color = "var(--accent)" }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20">
      <path d={OPEN_LEAVES} fill={color} />
    </svg>
  );
}

/** A closed bud - "looking" / "waiting". */
export function Bud({ size = 14, color = "var(--gold)", outline }: IconProps & { color?: string; outline?: boolean }) {
  return (
    <svg width={size * (16 / 18)} height={size} viewBox="-8 -9 16 18">
      <path
        d="M0 -7 C4 -3 4 3 0 5 C-4 3 -4 -3 0 -7 Z"
        fill={outline ? "none" : color}
        stroke={outline ? color : undefined}
        strokeWidth={outline ? 1.3 : undefined}
      />
      {outline && <path d="M0 5 V9" stroke={color} strokeWidth="1.3" />}
    </svg>
  );
}

/** The sync indicator: open in three gold leaves when synced, a pulsing bud
 * while syncing, a wilted bud on error. */
export function SyncFlower({ status, size = 18 }: { status: SyncStatus; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ overflow: "visible" }}>
      {status === "synced" && (
        <g className="sync-bloom">
          <path d={OPEN_LEAVES} fill="var(--gold)" />
          <path d="M0 4 V9.5" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" />
        </g>
      )}
      {status === "syncing" && (
        <g className="sync-bud">
          <path d="M0 -8 C4.5 -3.5 4.5 2.5 0 5 C-4.5 2.5 -4.5 -3.5 0 -8 Z" fill="var(--gold)" />
          <path
            d="M0 5 C-2.5 3 -5 4.5 -5.5 7 M0 5 C2.5 3 5 4.5 5.5 7 M0 5 V9.5"
            fill="none"
            stroke="var(--frame-ink-soft)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      )}
      {status === "error" && (
        <g className="sync-droop">
          <path d="M0 -7 C4 -3 4 2 0 4.5 C-4 2 -4 -3 0 -7 Z" fill="var(--alert)" />
          <path
            d="M0 4.5 V9.5 M0 7 C-2 6 -4 7 -4.5 8.5"
            fill="none"
            stroke="var(--alert)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

/** Section divider: a gold leaf between two curls. */
export function LeafDivider() {
  return (
    <svg width="30" height="10" viewBox="0 0 30 10">
      <path d="M15 1 C19 3.5 19 6.5 15 9 C11 6.5 11 3.5 15 1 Z" fill="var(--gold)" />
      <path
        d="M2 5 C6 2 9 8 12 5 M28 5 C24 2 21 8 18 5"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
