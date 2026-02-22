// ===============================
// src/screens/SplashScreen.tsx
// ===============================
import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onDone: () => void;

  mp4File?: string;
  gifFile?: string;

  /** Minimum visible time (ms). Default 3000 */
  minVisibleMs?: number;

  /** Hard timeout (ms). Default 3400 */
  hardTimeoutMs?: number;

  /** Show a small skip button (optional). Default true */
  showSkip?: boolean;
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
  minVisibleMs = 3000,
  hardTimeoutMs = 3400,
  showSkip = true,
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

  // Hard timeout always wins (mobile browsers can be weird with onEnded)
  useEffect(() => {
    const t = window.setTimeout(() => finish(), hardTimeoutMs);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When media "ends" (or is ready), wait until minVisibleMs is satisfied
  useEffect(() => {
    if (!mediaEnded) return;
    finishWithMinDelay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaEnded]);

  // Prevent scroll/selection during splash
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="splashRoot" role="presentation" aria-label="Splash">
      {/* Background media (cover) */}
      {!useGif ? (
        <video
          className="splashMedia"
          autoPlay
          muted
          playsInline
          // If your file is exactly ~3s, onEnded will trigger nicely.
          onEnded={() => setMediaEnded(true)}
          onError={(e) => {
            console.warn("Splash mp4 failed, falling back to gif:", mp4Src, e);
            setUseGif(true);
          }}
        >
          <source src={mp4Src} type="video/mp4" />
        </video>
      ) : (
        <img
          className="splashMedia"
          src={gifSrc}
          alt="Splash"
          // GIF doesn't "end" — we just start the min-delay clock when it's loaded
          onLoad={() => setMediaEnded(true)}
          onError={(e) => {
            console.warn("Splash gif failed too:", gifSrc, e);
            setMediaEnded(true);
          }}
        />
      )}

      {/* Optional: small skip button */}
      {showSkip ? (
        <button type="button" className="splashSkip" onClick={finishWithMinDelay}>
          Hopp over
        </button>
      ) : null}
    </div>
  );
}
