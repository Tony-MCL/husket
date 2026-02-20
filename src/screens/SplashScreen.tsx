// ===============================
// src/screens/SplashScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MCL_HUSKET_THEME } from "../theme";

type Props = {
  /** Called when splash is done (video ended or timeout/skip). */
  onDone: () => void;

  /** Defaults to "/splash.mp4" */
  mp4Src?: string;

  /** Defaults to "/splash.gif" */
  gifSrc?: string;

  /** Hard fallback timeout in ms (defaults to 4200) */
  fallbackMs?: number;
};

export function SplashScreen({
  onDone,
  mp4Src = "/splash.mp4",
  gifSrc = "/splash.gif",
  fallbackMs = 4200,
}: Props) {
  const doneRef = useRef(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const t = window.setTimeout(() => finish(), fallbackMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shellStyle = useMemo<React.CSSProperties>(
    () => ({
      minHeight: "100vh",
      width: "100%",
      display: "grid",
      placeItems: "center",
      background: MCL_HUSKET_THEME.colors.bg,
      color: MCL_HUSKET_THEME.colors.text,
      padding: 18,
      userSelect: "none",
    }),
    []
  );

  const cardStyle: React.CSSProperties = {
    width: "min(520px, 92vw)",
    borderRadius: 18,
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    background: "rgba(255,255,255,0.75)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    overflow: "hidden",
  };

  const mediaBoxStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: "1 / 1",
    background: "rgba(27, 26, 23, 0.06)",
    display: "grid",
    placeItems: "center",
  };

  const hintStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderTop: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    color: "rgba(27, 26, 23, 0.72)",
    fontSize: 12,
    fontWeight: 650,
  };

  const skipBtnStyle: React.CSSProperties = {
    border: `1px solid ${MCL_HUSKET_THEME.colors.outline}`,
    borderRadius: 999,
    padding: "8px 12px",
    background: "transparent",
    color: "rgba(27, 26, 23, 0.8)",
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1,
    cursor: "pointer",
  };

  return (
    <div style={shellStyle} onClick={finish} role="button" aria-label="Skip splash" tabIndex={0}>
      <div style={cardStyle}>
        <div style={mediaBoxStyle}>
          {!videoFailed ? (
            <video
              src={mp4Src}
              autoPlay
              muted
              playsInline
              onEnded={finish}
              onError={() => setVideoFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <img
              src={gifSrc}
              alt="husket splash"
              onError={() => finish()}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          )}
        </div>

        <div style={hintStyle}>
          <span>Tap anywhere to skip</span>
          <button type="button" onClick={finish} style={skipBtnStyle}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
