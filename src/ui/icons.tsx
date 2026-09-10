/**
 * Set de iconos de Bibliotheke. Trazo de 1.6, esquinas redondeadas, rejilla de
 * 24: una sola familia para toda la app.
 *
 * Sustituyen a los emoji, que rompían la identidad (cada sistema operativo los
 * dibuja a su manera y ninguno se parece a esta app) y no heredaban el color.
 */

import type { SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Icon({ size = 20, children, ...rest }: IconProps) {
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
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------- navegación ---------- */

export const IconLibrary = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 7.5C10.4 6 7.9 5.5 5 6.2v11.6c2.9-.7 5.4-.2 7 1.3 1.6-1.5 4.1-2 7-1.3V6.2c-2.9-.7-5.4-.2-7 1.3Z" />
    <path d="M12 7.5V19" />
  </Icon>
);

export const IconDice = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <circle cx="9" cy="9" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconAdd = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19h16" />
    <path d="M7.5 19v-6M12 19V6M16.5 19v-9" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h9M17.5 7H19M5 12h2.5M11 12h8M5 17h9M17.5 17H19" />
    <circle cx="15.5" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="15.5" cy="17" r="2" />
  </Icon>
);

/* ---------- acciones ---------- */

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5 9.5 17 19 7.5" />
  </Icon>
);

export const IconSkip = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 6.5 13 12l-8 5.5V6.5Z" />
    <path d="M18 6v12" />
  </Icon>
);

export const IconSnooze = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 14.2A7.6 7.6 0 0 1 9.8 4.5a7.6 7.6 0 1 0 9.7 9.7Z" />
  </Icon>
);

export const IconBan = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="m6.6 6.6 10.8 10.8" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A1.5 1.5 0 0 0 5.5 15" />
  </Icon>
);

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4v11M8 11.5l4 4 4-4" />
    <path d="M5 19h14" />
  </Icon>
);

export const IconShare = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" />
    <path d="M6 12.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5.5" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </Icon>
);

export const IconBack = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 9.5 12 15l5.5-5.5" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="m15.5 15.5 4 4" />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5 21 19H3l9-14.5Z" />
    <path d="M12 10v4M12 16.6v.1" />
  </Icon>
);

export const IconBolt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 3 5.5 13.5H11l-.5 7.5 8-10.5H13l.5-7.5Z" />
  </Icon>
);

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.6 6.8" />
    <path d="M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </Icon>
);

export const IconUpload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V8M8 11.5 12 7.5l4 4" />
    <path d="M5 4h14" />
  </Icon>
);

/* ---------- tipos de fuente ---------- */

export const IconFilm = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="M8 5.5v13M16 5.5v13M3.5 12h17" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="4" />
    <path d="m10.5 9.5 5 2.5-5 2.5v-5Z" />
  </Icon>
);

export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="5" />
    <circle cx="12" cy="12" r="3.6" />
    <circle cx="16.8" cy="7.2" r="0.9" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.5h7.5L18 8.5v11H6.5v-15Z" />
    <path d="M13.5 4.5V9H18" />
    <path d="M9.5 12.5h5M9.5 15.5h5" />
  </Icon>
);

/** Icono por tipo de fuente, para no repetir el mapa por toda la app. */
export function SourceIcon({ tipo, size = 16 }: { tipo: string; size?: number }) {
  switch (tipo) {
    case 'youtube':
      return <IconPlay size={size} />;
    case 'instagram':
      return <IconCamera size={size} />;
    case 'video':
      return <IconFilm size={size} />;
    default:
      return <IconText size={size} />;
  }
}

/** Valoración 1-5 en estrellas dibujadas, no en caracteres. */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value} de 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.9l6-.8L12 3.5Z"
            fill={i < value ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={i < value ? 0 : 1.4}
            strokeLinejoin="round"
            opacity={i < value ? 1 : 0.35}
          />
        </svg>
      ))}
    </span>
  );
}

/**
 * Cara de dado dibujada (1-6). Los caracteres ⚀⚁⚂ los pinta cada sistema a su
 * manera; esta se ve igual en todas partes y hereda el color de la marca.
 */
const PIPS: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[8.5, 8.5], [15.5, 15.5]],
  3: [[8.5, 8.5], [12, 12], [15.5, 15.5]],
  4: [[8.5, 8.5], [15.5, 8.5], [8.5, 15.5], [15.5, 15.5]],
  5: [[8.5, 8.5], [15.5, 8.5], [12, 12], [8.5, 15.5], [15.5, 15.5]],
  6: [[8.5, 8], [15.5, 8], [8.5, 12], [15.5, 12], [8.5, 16], [15.5, 16]],
};

export function DiceFace({ value = 5, size = 76 }: { value?: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="dice-svg">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {(PIPS[value] ?? PIPS[5]).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.5" fill="currentColor" />
      ))}
    </svg>
  );
}

/** Anillo de progreso: cuántos micropasos de una ficha están aplicados. */
export function ProgressRing({
  done,
  total,
  size = 26,
}: {
  done: number;
  total: number;
  size?: number;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const completo = total > 0 && done >= total;
  return (
    <span className={`ring ${completo ? 'full' : ''}`} title={`${done} de ${total} micropasos aplicados`}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.18" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span className="ring-label">
        {completo ? <IconCheck size={12} /> : done}
      </span>
    </span>
  );
}
