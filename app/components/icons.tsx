/**
 * The app's icon set, in one place.
 *
 * Every glyph used to be pasted inline wherever it was needed — the same board
 * icon in two headers, the same kebab in four menus, the same calendar in three
 * views. Drifting copies are how an icon set rots, so they live here instead.
 *
 * These are deliberately dumb: a single <svg> with the right viewBox and no
 * styling of its own. Size and colour keep coming from the *parent* (`.ic`,
 * `.icon-btn svg`, `.add-card svg`, …) exactly as before, so dropping one into
 * existing markup changes nothing visually. Pass `className="ic"` where the old
 * markup had it.
 */
type IconProps = { className?: string };

export const IconBoard = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M10 18V6C10 5.06812 10 4.60218 9.84776 4.23463C9.64477 3.74458 9.25542 3.35523 8.76537 3.15224C8.39782 3 7.93188 3 7 3C6.06812 3 5.60218 3 5.23463 3.15224C4.74458 3.35523 4.35523 3.74458 4.15224 4.23463C4 4.60218 4 5.06812 4 6V18C4 18.9319 4 19.3978 4.15224 19.7654C4.35523 20.2554 4.74458 20.6448 5.23463 20.8478C5.60218 21 6.06812 21 7 21C7.93188 21 8.39782 21 8.76537 20.8478C9.25542 20.6448 9.64477 20.2554 9.84776 19.7654C10 19.3978 10 18.9319 10 18Z" />
    <path d="M20 14V6C20 5.06812 20 4.60218 19.8478 4.23463C19.6448 3.74458 19.2554 3.35523 18.7654 3.15224C18.3978 3 17.9319 3 17 3C16.0681 3 15.6022 3 15.2346 3.15224C14.7446 3.35523 14.3552 3.74458 14.1522 4.23463C14 4.60218 14 5.06812 14 6V14C14 14.9319 14 15.3978 14.1522 15.7654C14.3552 16.2554 14.7446 16.6448 15.2346 16.8478C15.6022 17 16.0681 17 17 17C17.9319 17 18.3978 17 18.7654 16.8478C19.2554 16.6448 19.6448 16.2554 19.8478 15.7654C20 15.3978 20 14.9319 20 14Z" />
  </svg>
);

export const IconTimeline = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M14 14C14.9319 14 15.3978 14 15.7654 14.1522C16.2554 14.3552 16.6448 14.7446 16.8478 15.2346C17 15.6022 17 16.0681 17 17C17 17.9319 17 18.3978 16.8478 18.7654C16.6448 19.2554 16.2554 19.6448 15.7654 19.8478C15.3978 20 14.9319 20 14 20L6 20C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14L14 14Z" />
    <path d="M18 4C18.9319 4 19.3978 4 19.7654 4.15224C20.2554 4.35523 20.6448 4.74458 20.8478 5.23463C21 5.60218 21 6.06812 21 7C21 7.93188 21 8.39783 20.8478 8.76537C20.6448 9.25542 20.2554 9.64477 19.7654 9.84776C19.3978 10 18.9319 10 18 10H6C5.06812 10 4.60218 10 4.23463 9.84776C3.74458 9.64477 3.35523 9.25542 3.15224 8.76537C3 8.39783 3 7.93188 3 7C3 6.06812 3 5.60218 3.15224 5.23464C3.35523 4.74458 3.74458 4.35523 4.23463 4.15224C4.60218 4 5.06812 4 6 4L18 4Z" />
  </svg>
);

export const IconPlus = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M8 3.5v9M3.5 8h9" /></svg>
);

/* The big tick inside a card checkbox. */
export const IconCheck = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);

/* The small tick used on chips and menu rows. */
export const IconTick = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M3.5 8.5l3 3 6-7" /></svg>
);

/* Vertical ⋯ — every "more actions" affordance. */
export const IconDots = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" />
    <path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" />
    <path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" />
  </svg>
);

export const IconCalendar = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M21 10H3M16 2V6M8 2V6M7.8 22H16.2C17.8802 22 18.7202 22 19.362 21.673C19.9265 21.3854 20.3854 20.9265 20.673 20.362C21 19.7202 21 18.8802 21 17.2V8.8C21 7.11984 21 6.27976 20.673 5.63803C20.3854 5.07354 19.9265 4.6146 19.362 4.32698C18.7202 4 17.8802 4 16.2 4H7.8C6.11984 4 5.27976 4 4.63803 4.32698C4.07354 4.6146 3.6146 5.07354 3.32698 5.63803C3 6.27976 3 7.11984 3 8.8V17.2C3 18.8802 3 19.7202 3.32698 20.362C3.6146 20.9265 4.07354 21.3854 4.63803 21.673C5.27976 22 6.11984 22 7.8 22Z" /></svg>
);

export const IconPencil = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M12 20H21M3.00003 20H4.67457C5.16376 20 5.40835 20 5.63852 19.9447C5.84259 19.8957 6.03768 19.8149 6.21663 19.7053C6.41846 19.5816 6.59141 19.4086 6.93732 19.0627L19.5001 6.49998C20.3285 5.67156 20.3285 4.32841 19.5001 3.49998C18.6716 2.67156 17.3285 2.67156 16.5001 3.49998L3.93729 16.0627C3.59139 16.4086 3.41843 16.5816 3.29475 16.7834C3.18509 16.9624 3.10428 17.1574 3.05529 17.3615C3.00003 17.5917 3.00003 17.8363 3.00003 18.3255V20Z" /></svg>
);

export const IconTrash = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M9 3H15M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 18.1409 18.8867 17.8 19.485C17.4999 20.0118 17.0472 20.4353 16.5017 20.6997C15.882 21 15.0911 21 13.5093 21H10.4907C8.90891 21 8.11803 21 7.49834 20.6997C6.95276 20.4353 6.50009 20.0118 6.19998 19.485C5.85911 18.8867 5.8065 18.0975 5.70129 16.5193L5 6" /></svg>
);

export const IconChevronDown = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M4 6l4 4 4-4" /></svg>
);

export const IconChevronLeft = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M10 3l-5 5 5 5" /></svg>
);

export const IconChevronRight = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M6 3l5 5-5 5" /></svg>
);

/* Git graph — the repository control and the branch chip. */
export const IconRepo = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M6 3V15M6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21C7.65685 21 9 19.6569 9 18M6 15C7.65685 15 9 16.3431 9 18M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9ZM18 9C18 11.3869 17.0518 13.6761 15.364 15.364C13.6761 17.0518 11.3869 18 9 18" /></svg>
);

export const IconMerge = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M5 3v4a4 4 0 0 0 4 4h4M9.5 8.5l3.5 2.5-3.5 2.5" /></svg>
);

/* Arrow back into a line — "reopen", the inverse of completing. */
export const IconReopen = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M3.5 8h9M8 3.5l-4.5 4.5 4.5 4.5" /></svg>
);

export const IconClose = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);

/* A planted flag — a milestone: the day something is due to land. */
export const IconFlag = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" className={className}><path d="M4 14V2.5M4 3h7.5l-1.6 2.6L11.5 8H4" /></svg>
);

export const IconBell = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
);
