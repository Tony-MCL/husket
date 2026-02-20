// ===============================
// src/screens/SplashScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MCL_HUSKET_THEME } from "../theme";

type Props = {
  onDone: () => void;

  mp4File?: string;
  gifFile?: string;

  /** Minimum synlig tid (ms). Default 4500 */
  minVisibleMs?: number;

  /** Hard timeout (ms). Default 6500 */
  hardTimeoutMs?: number;
};

function withBaseUrl(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const safeBase = base.endsWith("/") ? base : `${base}/`;
  return `${safeBase}${file.replace(/^\//, "")}`;
}

export function SplashScreen({
  onDone,
  mp4File = "splash.mp4",
  gifFile = "splash.gif",
  minVisibleMs = 4500,
  hardTimeoutMs = 6500,
}: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const doneRef = useRef(false);

  const [useGif, setUseGif] = useState(false);
  const [mediaEnded, setMediaEnded] = useState(false);

  const mp4Src = useMemo(() => withBaseUrl(mp4File), [mp4File]);
  const gifSrc = useMemo(() => withBaseUrl(gifFile), [gifFile]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const finishWithMinDelay = () => {
    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, minVisibleMs - elapsed);
    window.setTimeout(() => finish(), remaining);
  };

  useEffect(() => {
    const t = window.setTimeout(() => finish(), hardTimeoutMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mediaEnded) return;
    finishWithMinDelay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaEnded]);

  const shellStyle = useMemo<React.CSSProperties>(
    () => ({
      minHeight: "100vh",
      width: "100%",
      display: "grid",
      placeItems: "center",
      backgroundColor: MCL_HUSKET_THEME.colors.altSurface,
      color: MCL_HUSKET_THEME.colors.textOnDark,
      padding: 18,
      boxSizing: "border-box",
      userSelect: "none",
    }),
    []
  );

  const centerStyle: React.CSSProperties = {
    width: "min(560px, 92vw)",
    display: "grid",
    placeItems: "center",
    gap: 14,
  };

  const mediaStyle: React.CSSProperties = {
    width: "min(420px, 80vw)",
    height: "auto",
    maxHeight: "70vh",
    objectFit: "contain",
    display: "block",
  };

  const titleStyle: React.CSSProperties = {
    fontWeight: 900,
    letterSpacing: 0.4,
    opacity: 0.92,
  };

  const skipStyle: React.CSSProperties = {
    marginTop: 6,
    opacity: 0.6,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    background: "transparent",
    border: "none",
    color: MCL_HUSKET_THEME.colors.textOnDark,
    padding: 8,
  };

  return (
    <div style={shellStyle}>
      <div style={centerStyle}>
        {!useGif ? (
          <video
            autoPlay
            muted
            playsInline
            onEnded={() => setMediaEnded(true)}
            onError={(e) => {
              console.warn("Splash mp4 failed, falling back to gif:", mp4Src, e);
              setUseGif(true);
            }}
            style={mediaStyle}
          >
            <source src={mp4Src} type="video/mp4" />
          </video>
        ) : (
          <img
            src={gifSrc}
            alt="husket splash"
            onLoad={() => setMediaEnded(true)}
            onError={(e) => {
              console.warn("Splash gif failed too:", gifSrc, e);
              setMediaEnded(true);
            }}
            style={mediaStyle}
          />
        )}

        <div style={titleStyle}>husket</div>

        <button type="button" style={skipStyle} onClick={finishWithMinDelay}>
          Trykk for å hoppe over
        </button>
      </div>
    </div>
  );
}
