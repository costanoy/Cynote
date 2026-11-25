import type { ReactNode } from "react";

type IconProps = { size?: number };

// Interface icons: 16x16 grid, one 1.5 stroke, rounded ends, currentColor.
function Stroke({ size, width = 1.5, children }: { size: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MenuIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </Stroke>
  );
}

export function DrawIcon({ size = 16, width = 1.5 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width}>
      <path d="M2.8 13.2l.9-3.3 7.4-7.4a1.5 1.5 0 0 1 2.1 2.1l-7.4 7.4z" />
      <path d="M9.9 3.7l2.4 2.4" />
    </Stroke>
  );
}

export function MarkerIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M5.2 11.8l-1.6 1.7H1.8l2-2" />
      <path d="M3.8 11.5l1.7 1.7 7.9-7.9a1.2 1.2 0 0 0 0-1.7l-1.1-1.1a1.2 1.2 0 0 0-1.7 0z" />
    </Stroke>
  );
}

export function EraserIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M7 13.5h6.5" />
      <path d="M5.2 13.5L2.6 10.9a1.3 1.3 0 0 1 0-1.8l6.3-6.3a1.3 1.3 0 0 1 1.8 0l2.6 2.6a1.3 1.3 0 0 1 0 1.8l-5.9 6.3z" />
      <path d="M5.8 6l4.2 4.2" />
    </Stroke>
  );
}

export function UndoIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M5.5 3.5L2.5 6.5l3 3" />
      <path d="M2.5 6.5h7.2a3.3 3.3 0 0 1 0 6.6H8" />
    </Stroke>
  );
}

export function RedoIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M10.5 3.5l3 3-3 3" />
      <path d="M13.5 6.5H6.3a3.3 3.3 0 0 0 0 6.6H8" />
    </Stroke>
  );
}

export function SettingsIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M2.5 4.5h3.2M9.5 4.5h4M2.5 11.5h6.2M12.5 11.5h1" />
      <circle cx="7.6" cy="4.5" r="1.9" />
      <circle cx="10.6" cy="11.5" r="1.9" />
    </Stroke>
  );
}

export function PinIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M6 2.5h4M7 2.5v3.8L4.5 9h7L9 6.3V2.5M8 9v4.5" />
    </Stroke>
  );
}

/** Windows caption glyphs: drawn on a 10px grid with a 1px stroke, like the system's. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      {children}
    </svg>
  );
}
export function MinimizeIcon(_: IconProps) {
  return (
    <Caption>
      <path d="M0 5.5h10" />
    </Caption>
  );
}
export function MaximizeIcon(_: IconProps) {
  return (
    <Caption>
      <rect x="0.5" y="0.5" width="9" height="9" rx="1" />
    </Caption>
  );
}
export function CaptionCloseIcon(_: IconProps) {
  return (
    <Caption>
      <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
    </Caption>
  );
}

export function CloseIcon({ size = 16, width = 1.5 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Stroke>
  );
}

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M8 3v10M3 8h10" />
    </Stroke>
  );
}

export function ChevronDownIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M4 6l4 4 4-4" />
    </Stroke>
  );
}

export function ChevronRightIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M6 4l4 4-4 4" />
    </Stroke>
  );
}

export function ArrowUpIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </Stroke>
  );
}

export function ArrowDownIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </Stroke>
  );
}

export function BackIcon({ size = 16, width = 1.5 }: IconProps & { width?: number }) {
  return (
    <Stroke size={size} width={width}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </Stroke>
  );
}

export function ReadingIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M8 4.6C6.8 3.6 5 3 2.5 3v9.4c2.5 0 4.3.6 5.5 1.6 1.2-1 3-1.6 5.5-1.6V3C11 3 9.2 3.6 8 4.6z" />
      <path d="M8 4.6V14" />
    </Stroke>
  );
}

export function WrapIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M2.5 4h11M2.5 8h8.5a2.2 2.2 0 0 1 0 4.4H8.5" />
      <path d="M10 10.9l-1.5 1.5 1.5 1.5M2.5 12.4h3" />
    </Stroke>
  );
}

export function EditIcon({ size = 14 }: IconProps) {
  return <DrawIcon size={size} />;
}

export function TrashIcon({ size = 14 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M2.5 4.5h11M6.3 4.5V2.8h3.4v1.7M4 4.5l.7 8.7h6.6l.7-8.7" />
    </Stroke>
  );
}

export function RefreshIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M13 7.2A5 5 0 0 0 4 4.6L2.8 6" />
      <path d="M2.8 2.8V6h3.2" />
      <path d="M3 8.8A5 5 0 0 0 12 11.4L13.2 10" />
      <path d="M13.2 13.2V10H10" />
    </Stroke>
  );
}

export function PhoneIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <rect x="4.5" y="1.8" width="7" height="12.4" rx="1.6" />
      <path d="M7 11.8h2" />
    </Stroke>
  );
}

export function UpdateIcon({ size = 16 }: IconProps) {
  return (
    <Stroke size={size}>
      <path d="M8 2.5v7.5M4.8 6.8L8 10l3.2-3.2M2.8 11.5v1.7h10.4v-1.7" />
    </Stroke>
  );
}

export function GripIcon() {
  return (
    <svg width="6" height="12" viewBox="0 0 6 12" fill="currentColor" aria-hidden="true">
      <circle cx="1.5" cy="2" r="1" />
      <circle cx="4.5" cy="2" r="1" />
      <circle cx="1.5" cy="6" r="1" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="1.5" cy="10" r="1" />
      <circle cx="4.5" cy="10" r="1" />
    </svg>
  );
}

/** Sync state as a cloud: a check when synced, turning arrows while syncing,
 * a slash offline, an exclamation when something is wrong, outline when off. */
export function SyncGlyph({ phase, size = 14 }: { phase: string; size?: number }) {
  const cloud = "M4.6 12.6h6.6a2.9 2.9 0 0 0 .4-5.8A4 4 0 0 0 4 7.6a2.5 2.5 0 0 0 .6 5z";
  return (
    <Stroke size={size}>
      <path d={cloud} opacity={phase === "off" ? 0.7 : 1} />
      {phase === "synced" && <path d="M6.3 9.9l1.3 1.2 2.3-2.5" />}
      {phase === "syncing" && <path className="sync-turn" d="M6.2 9.6a1.9 1.9 0 0 1 3.4-.9M9.8 10.4a1.9 1.9 0 0 1-3.4.9" />}
      {phase === "offline" && <path d="M2.5 2.5l11 11" />}
      {(phase === "error" || phase === "denied") && <path d="M8 8.2v1.6M8 11.4v.1" />}
    </Stroke>
  );
}

/** The Cynote mark: a steno pad on its cover, two rules and the ballpoint's. */
export function AppMark({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1.5" y="1.5" width="15" height="15" rx="3.5" fill="var(--cover)" />
      <path d="M5 6.5h8.5M5 9.5h8.5" stroke="var(--cover-ink)" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 12.5h8.5" stroke="#9db8ff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.9 4v11" stroke="#e58a80" strokeWidth="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Names kept from the retired greenhouse look so screens not yet rebuilt still
// compile. They draw nothing ornamental anymore.

export function LogoMedallion() {
  return <AppMark />;
}
export function ArchShape() {
  return null;
}
export function ArchVines() {
  return null;
}
export function CornerVignette(_: { corner: "tl" | "tr" | "bl" | "br" }) {
  return null;
}
export function Sprout(_: IconProps) {
  return null;
}
export function Leaf({ size = 8, color = "var(--accent)" }: IconProps & { color?: string; rotate?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="3" fill={color} />
    </svg>
  );
}
export function OpenLeaves(_: IconProps & { color?: string }) {
  return null;
}
export function Bud({ size = 8, color = "var(--accent)", outline }: IconProps & { color?: string; outline?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true">
      <circle cx="4" cy="4" r="3" fill={outline ? "none" : color} stroke={color} strokeWidth={outline ? 1.2 : 0} />
    </svg>
  );
}
export function SyncFlower({ status, size = 14 }: { status: string; size?: number }) {
  return <SyncGlyph phase={status} size={size} />;
}
export function LeafDivider() {
  return <span className="divider" role="separator" />;
}
