// ===============================
// src/components/icons/Dice.tsx
// ===============================
import React from "react";

type Props = {
  face: 1 | 2 | 3 | 4 | 5 | 6;
  title?: string;
  style?: React.CSSProperties;
};

function pipsForFace(face: Props["face"]): Array<{ x: number; y: number }> {
  const L = 8;
  const C = 12;
  const R = 16;

  const T = 8;
  const M = 12;
  const B = 16;

  switch (face) {
    case 1:
      return [{ x: C, y: M }];
    case 2:
      return [
        { x: L, y: T },
        { x: R, y: B },
      ];
    case 3:
      return [
        { x: L, y: T },
        { x: C, y: M },
        { x: R, y: B },
      ];
    case 4:
      return [
        { x: L, y: T },
        { x: R, y: T },
        { x: L, y: B },
        { x: R, y: B },
      ];
    case 5:
      return [
        { x: L, y: T },
        { x: R, y: T },
        { x: C, y: M },
        { x: L, y: B },
        { x: R, y: B },
      ];
    case 6:
      return [
        { x: L, y: T },
        { x: L, y: M },
        { x: L, y: B },
        { x: R, y: T },
        { x: R, y: M },
        { x: R, y: B },
      ];
    default:
      return [{ x: C, y: M }];
  }
}

export function Dice({ face, title, style }: Props) {
  const pip = pipsForFace(face);

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      style={{
        width: "1.25em",
        height: "1.25em",
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {title ? <title>{title}</title> : null}

      <rect
        x={3.5}
        y={3.5}
        width={17}
        height={17}
        rx={4.5}
        fill="#FFFFFF"
        stroke="#1B1A17"
        strokeOpacity={0.35}
        strokeWidth={1.4}
      />

      {pip.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={1.7} fill="#1B1A17" fillOpacity={0.92} />
      ))}
    </svg>
  );
}
