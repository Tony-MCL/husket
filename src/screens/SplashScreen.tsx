// ===============================
// src/screens/SplashScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { MCL_HUSKET_THEME } from "../theme";

type Props = {
  onDone: () => void;

  /** Defaults to "/splash.mp4" */
  mp4Src?: string;

  /** Defaults to "/splash.gif" */
  gifSrc?: string;

  /**
   * Minimum time the splash must be visible (ms),
   * even if media ends quickly or fails to load.
   * Defaults to 6000 (4s anim + ~2s).
   */
  minVisibleMs?: number;

  /**
   * Hard fallback timeout (ms).
   * Defaults to 9000.
   */
  hardTimeoutMs?: number;
};

export function SplashScreen({
  onDone,
  mp4Src = "/splash.mp4",
  gifSrc = "/splash.gif",
  minVisibleMs = 6000,
  hardTimeoutMs = 9000,
}: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const doneRef = useRef(false);

  const [videoFailed, setVideoFailed] = useState(false);
  const [mediaEnded, setMediaEnded] = useState(false);

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
    // Hard timeout: never get stuck here
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

  const fallbackTextStyle: React.CSSProperties = {
    fontWeight: 800,
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
        {!videoFailed ? (
          <video
            src={mp4Src}
            autoPlay
            muted
            playsInline
            onEnded={() => setMediaEnded(true)}
            onError={() => {
              // If mp4 missing/unplayable, fall back to gif – but do NOT auto-finish.
              setVideoFailed(true);
            }}
            style={mediaStyle}
          />
        ) : (
          <img
            src={gifSrc}
            alt="husket splash"
            onLoad={() => {
              // GIF has no reliable "ended" event; we keep minVisibleMs anyway.
              // Mark mediaEnded to start the min-visible countdown once it's loaded.
              setMediaEnded(true);
            }}
            onError={() => {
              // If both mp4 and gif missing, show text and just wait minVisibleMs/hardTimeoutMs.
              setMediaEnded(true);
            }}
            style={mediaStyle}
          />
        )}

        {videoFailed ? null : null}

        {/* If assets are missing, the img tag will error and we still show this */}
        <div style={fallbackTextStyle}>husket</div>

        <button type="button" style={skipStyle} onClick={finishWithMinDelay}>
          Trykk for å hoppe over
        </button>
      </div>
    </div>
  );
}
