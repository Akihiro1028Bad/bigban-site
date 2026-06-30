/**
 * 承認画面用の軽量アイコン。proto(#proto) からの本番移植。
 *
 * 依存を増やさないため、Tabler/Lucide 系の 24x24 / stroke 1.6 を手書きで持つ。
 * currentColor を継承し、size で一括指定する。
 */
import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Base({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Base {...p}><path d="M5 12.5l4.5 4.5L19 6.5" /></Base>
);
export const IconCheckCircle = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.2l2.4 2.4 4.6-4.9" /></Base>
);
export const IconX = (p: IconProps) => (
  <Base {...p}><path d="M6 6l12 12M18 6L6 18" /></Base>
);
export const IconEdit = (p: IconProps) => (
  <Base {...p}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Base>
);
export const IconSparkles = (p: IconProps) => (
  <Base {...p}><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.7l-1.7-4.7L6 9.3l4.3-1.7L12 3z" /><path d="M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></Base>
);
export const IconCalendar = (p: IconProps) => (
  <Base {...p}><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M4 9.5h16M8 3.5v3M16 3.5v3" /></Base>
);
export const IconClock = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></Base>
);
export const IconSearch = (p: IconProps) => (
  <Base {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></Base>
);
export const IconCommand = (p: IconProps) => (
  <Base {...p}><path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 10-3 3" /></Base>
);
export const IconArrowRight = (p: IconProps) => (
  <Base {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Base>
);
export const IconChevronRight = (p: IconProps) => (
  <Base {...p}><path d="M9 6l6 6-6 6" /></Base>
);
export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Base>
);
export const IconChevronDown = (p: IconProps) => (
  <Base {...p}><path d="M6 9l6 6 6-6" /></Base>
);
export const IconBolt = (p: IconProps) => (
  <Base {...p}><path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" /></Base>
);
export const IconFileText = (p: IconProps) => (
  <Base {...p}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M8.5 13h7M8.5 16.5h7" /></Base>
);
export const IconImage = (p: IconProps) => (
  <Base {...p}><rect x="4" y="4" width="16" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="M5 17l4.5-4.5L13 16l3-3 3 3.2" /></Base>
);
export const IconLayout = (p: IconProps) => (
  <Base {...p}><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M4 9.5h16M9.5 9.5V20" /></Base>
);
export const IconWand = (p: IconProps) => (
  <Base {...p}><path d="M5 19l9-9M14.5 4.5l1 1M9 4l.6 1.6L11 6l-1.4.4L9 8l-.6-1.6L7 6l1.4-.4L9 4z" /><path d="M15 9l.5 1.3L17 11l-1.5.5L15 13l-.5-1.5L13 11l1.5-.7L15 9z" /></Base>
);
export const IconChart = (p: IconProps) => (
  <Base {...p}><path d="M5 5v14h14" /><path d="M9 15l3-4 3 2 4-6" /></Base>
);
export const IconArrowUp = (p: IconProps) => (
  <Base {...p}><path d="M12 19V6M6 12l6-6 6 6" /></Base>
);
export const IconArrowDown = (p: IconProps) => (
  <Base {...p}><path d="M12 5v13M6 12l6 6 6-6" /></Base>
);
export const IconDot = (p: IconProps) => (
  <Base {...p}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></Base>
);
export const IconKeyboard = (p: IconProps) => (
  <Base {...p}><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 13.5h10" /></Base>
);
export const IconList = (p: IconProps) => (
  <Base {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></Base>
);
export const IconInbox = (p: IconProps) => (
  <Base {...p}><path d="M4 13l2.5-7h11L20 13v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" /><path d="M4 13h4l1.5 2.5h5L16 13h4" /></Base>
);
export const IconDeviceMobile = (p: IconProps) => (
  <Base {...p}><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></Base>
);
export const IconDeviceTablet = (p: IconProps) => (
  <Base {...p}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M11.5 18h1" /></Base>
);
export const IconDeviceDesktop = (p: IconProps) => (
  <Base {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Base>
);
export const IconExternalLink = (p: IconProps) => (
  <Base {...p}><path d="M14 5h5v5M19 5l-7 7M11 5H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4" /></Base>
);
export const IconUpload = (p: IconProps) => (
  <Base {...p}><path d="M12 16V5M7 10l5-5 5 5M5 19h14" /></Base>
);
export const IconRefresh = (p: IconProps) => (
  <Base {...p}><path d="M4 12a8 8 0 0114-5.3L20 8M20 12a8 8 0 01-14 5.3L4 16M20 4v4h-4M4 20v-4h4" /></Base>
);
export const IconPlus = (p: IconProps) => (
  <Base {...p}><path d="M12 5v14M5 12h14" /></Base>
);
export const IconMessage = (p: IconProps) => (
  <Base {...p}><path d="M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H9l-4 3.5V6a1 1 0 011-1z" /></Base>
);
