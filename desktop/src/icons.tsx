type IconProps = { size?: number };

export function LogoIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="logoBg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffa452" />
          <stop offset="1" stopColor="#f2711a" />
        </linearGradient>
        <linearGradient id="logoSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="logoClip">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" />
        </clipPath>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="url(#logoBg)" />
      <ellipse cx="12" cy="6" rx="9" ry="5" fill="url(#logoSheen)" clipPath="url(#logoClip)" />
      <path d="M7.6 8.8h8.8M7.6 12.2h8.8M7.6 15.6h5.6" stroke="#fffaf3" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Same card/gradient treatment as LogoIcon, but a folder-of-notes glyph
// instead of note lines - keeps the Dashboard window's own header visually
// distinct from the main Cynote window's, matching their separate taskbar icons.
export function DashboardLogoIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="dashLogoBg" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffa452" />
          <stop offset="1" stopColor="#f2711a" />
        </linearGradient>
        <linearGradient id="dashLogoSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="dashLogoClip">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" />
        </clipPath>
      </defs>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="url(#dashLogoBg)" />
      <ellipse cx="12" cy="6" rx="9" ry="5" fill="url(#dashLogoSheen)" clipPath="url(#dashLogoClip)" />
      <path
        d="M5.5 9a1 1 0 011-1h3.4l1.3 1.3H18a1 1 0 011 1V17a1 1 0 01-1 1H6.5a1 1 0 01-1-1z"
        fill="#fffaf3"
      />
      <rect x="7.3" y="10.6" width="3.7" height="2.8" rx="0.7" fill="#f2711a" fillOpacity="0.22" />
      <rect x="11.7" y="10.6" width="3.7" height="2.8" rx="0.7" fill="#f2711a" fillOpacity="0.22" />
      <rect x="7.3" y="14.1" width="3.7" height="2.8" rx="0.7" fill="#f2711a" fillOpacity="0.22" />
      <rect x="11.7" y="14.1" width="3.7" height="2.8" rx="0.7" fill="#f2711a" fillOpacity="0.22" />
    </svg>
  );
}

export function FormatIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="19" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function DrawIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M17.7 3.3a2.4 2.4 0 013.4 3.4L9.6 18.2a2 2 0 01-.9.53l-4.2 1.27a.5.5 0 01-.62-.62l1.27-4.2a2 2 0 01.53-.9z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15.3 5.7l3.4 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 7h15M9.5 7V4.5a1 1 0 011-1h3a1 1 0 011 1V7" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.5 7v12a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5V7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v5.5M14 11v5.5" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-2.6-1.5L14 2h-4l-.5 2.5a7.6 7.6 0 00-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 000 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 002.6 1.5L10 22h4l.5-2.5a7.6 7.6 0 002.6-1.5l2.3.9 2-3.4z" />
    </svg>
  );
}

export function PinIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z" />
    </svg>
  );
}

export function MinimizeIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function MaximizeIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

export function CloseIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function TabCloseIcon({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

export function GripIcon({ size = 9 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7" cy="6" r="2" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="17" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function BackChevronIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ExportIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 3v12M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19h16" strokeLinecap="round" />
    </svg>
  );
}

export function FolderIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6.5A1.5 1.5 0 014.5 5h5l2 2.5h8A1.5 1.5 0 0121 9v9a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18z" />
    </svg>
  );
}

export function NoteFileIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M15 3v5h5" />
    </svg>
  );
}

export function ReadingIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M2 4v15a3 3 0 013-3h7v-15z" />
      <path d="M22 4v15a3 3 0 00-3-3h-7v-15z" />
    </svg>
  );
}
