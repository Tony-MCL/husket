// ===============================
// src/app/App.tsx
// ===============================
import React, { useEffect, useMemo, useState } from "react";
import type { LifeKey, Settings } from "../domain/types";
import { loadSettings, saveSettings } from "../data/settingsRepo";
import { getDict } from "../i18n";
import { ToastProvider } from "../components/ToastHost";
import { TopBar } from "../components/TopBar";
import { BottomNav } from "../components/BottomNav";
import type { RouteKey } from "./routes";
import { CaptureScreen } from "../screens/CaptureScreen";
import { AlbumScreen } from "../screens/AlbumScreen";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { PaywallModal } from "../components/PaywallModal";
import { MCL_HUSKET_THEME } from "../theme";
import { SplashScreen } from "../screens/SplashScreen";
import { LifeSelectScreen } from "../screens/LifeSelectScreen";

type BootStage = "splash" | "lifeSelect" | "main";
type FadeStage = "none" | "fadingOut" | "fadingIn";

const LAST_LIFE_KEY = "husket:lastLife";
const SESSION_LIFE_SHOWN_KEY = "husket:lifeSelectShownThisSession";

function isLifeKey(x: string): x is LifeKey {
  return x === "private" || x === "work" || x === "custom1" || x === "custom2";
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const dict = useMemo(() => getDict(settings.language), [settings.language]);

  const [boot, setBoot] = useState<BootStage>("splash");
  const [fade, setFade] = useState<FadeStage>("none");

  const [life, setLife] = useState<LifeKey>("private");
  const [route, setRoute] = useState<RouteKey>("capture");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);

    const allowed: LifeKey[] = [
      ...(next.lives.enabledPrivate ? (["private"] as LifeKey[]) : []),
      ...(next.lives.enabledCustom1 ? (["custom1"] as LifeKey[]) : []),
      ...(next.lives.enabledCustom2 ? (["custom2"] as LifeKey[]) : []),
      ...(next.lives.enabledWork ? (["work"] as LifeKey[]) : []),
    ];

    const fallback: LifeKey = allowed[0] ?? "private";
    if (!allowed.includes(life)) setLife(fallback);
  };

  const requirePremium = () => setPaywallOpen(true);

  const activatePremiumMock = () => {
    const next: Settings = { ...settings, premium: true };
    updateSettings(next);
    setPaywallOpen(false);
  };

  const onSavedGoAlbum = () => setRoute("album");

  // -----------------------------------
  // Boot helpers
  // -----------------------------------
  const getStoredLife = (): LifeKey | null => {
    try {
      const raw = localStorage.getItem(LAST_LIFE_KEY);
      if (!raw) return null;
      if (!isLifeKey(raw)) return null;
      return raw;
    } catch {
      return null;
    }
  };

  const setStoredLife = (v: LifeKey) => {
    try {
      localStorage.setItem(LAST_LIFE_KEY, v);
    } catch {
      // ignore
    }
  };

  const hasShownLifeSelectThisSession = (): boolean => {
    try {
      return sessionStorage.getItem(SESSION_LIFE_SHOWN_KEY) === "1";
    } catch {
      return false;
    }
  };

  const markLifeSelectShownThisSession = () => {
    try {
      sessionStorage.setItem(SESSION_LIFE_SHOWN_KEY, "1");
    } catch {
      // ignore
    }
  };

  // Decide next stage after splash:
  // - Always show LifeSelect on a hard refresh / new tab (fresh sessionStorage)
  // - Otherwise we may skip LifeSelect if lastLife exists
  const goAfterSplash = () => {
    const last = getStoredLife();

    const mustShow = !hasShownLifeSelectThisSession(); // fresh session => show
    if (mustShow || !last) {
      markLifeSelectShownThisSession();
      setBoot("lifeSelect");
      return;
    }

    // Skip life select
    setLife(last);
    setRoute("capture");
    setBoot("main");
  };

  // -----------------------------------
  // Fade between stages (simple, no libs)
  // -----------------------------------
  const FADE_MS = 220;

  useEffect(() => {
    if (fade === "fadingOut") {
      const t = window.setTimeout(() => setFade("fadingIn"), FADE_MS);
      return () => window.clearTimeout(t);
    }
    if (fade === "fadingIn") {
      const t = window.setTimeout(() => setFade("none"), FADE_MS);
      return () => window.clearTimeout(t);
    }
    return;
  }, [fade]);

  const fadeStyle: React.CSSProperties =
    fade === "none"
      ? { opacity: 1, transition: "opacity 180ms ease" }
      : fade === "fadingOut"
      ? { opacity: 0, transition: `opacity ${FADE_MS}ms ease` }
      : { opacity: 1, transition: `opacity ${FADE_MS}ms ease` };

  // -------------------------------
  // Boot flow: Splash -> (fade) -> Life select/Main
  // -------------------------------
  if (boot === "splash") {
    return (
      <SplashScreen
        onDone={() => {
          // start fade out, then switch screen, then fade in
          setFade("fadingOut");
          window.setTimeout(() => {
            goAfterSplash();
            setFade("fadingIn");
          }, FADE_MS);
        }}
        mp4File="splash.mp4"
        gifFile="splash.gif"
        minVisibleMs={4500}
        hardTimeoutMs={6500}
      />
    );
  }

  if (boot === "lifeSelect") {
    return (
      <div style={fadeStyle}>
        <LifeSelectScreen
          dict={dict}
          settings={settings}
          onPick={(picked) => {
            setStoredLife(picked);
            setLife(picked);
            setRoute("capture");
            setFade("fadingOut");
            window.setTimeout(() => {
              setBoot("main");
              setFade("fadingIn");
            }, FADE_MS);
          }}
        />
      </div>
    );
  }

  // -------------------------------
  // Main app
  // -------------------------------
  return (
    <div style={fadeStyle}>
      <ToastProvider>
        <div
          className="appShell"
          style={{
            backgroundColor: MCL_HUSKET_THEME.colors.altSurface,
            color: MCL_HUSKET_THEME.colors.textOnDark,
          }}
        >
          <TopBar
            dict={dict}
            settings={settings}
            life={life}
            onLifeChange={(nextLife) => {
              setLife(nextLife);
              setStoredLife(nextLife);
            }}
            onOpenSettings={() => setDrawerOpen(true)}
          />

          {route === "capture" ? (
            <CaptureScreen
              dict={dict}
              life={life}
              settings={settings}
              onRequirePremium={requirePremium}
              onSavedGoAlbum={onSavedGoAlbum}
            />
          ) : null}

          {route === "album" ? <AlbumScreen dict={dict} life={life} settings={settings} /> : null}

          <SettingsDrawer
            dict={dict}
            open={drawerOpen}
            activeLife={life}
            settings={settings}
            onClose={() => setDrawerOpen(false)}
            onChange={updateSettings}
            onRequirePremium={requirePremium}
          />

          <PaywallModal
            dict={dict}
            open={paywallOpen}
            onCancel={() => setPaywallOpen(false)}
            onActivate={activatePremiumMock}
          />

          <BottomNav dict={dict} route={route} onRouteChange={setRoute} />
        </div>
      </ToastProvider>
    </div>
  );
}
