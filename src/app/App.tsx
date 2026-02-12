// ===============================
// src/app/App.tsx
// ===============================
import React, { useMemo, useState } from "react";
import type { LifeKey, Settings } from "../domain/types";
import { loadSettings, saveSettings } from "../data/settingsRepo";
import { getDict } from "../i18n";
import { ToastProvider } from "../components/ToastHost";
import { TopBar } from "../components/TopBar";
import { BottomNav } from "../components/BottomNav";
import type { RouteKey } from "./routes";
import { CaptureScreen } from "../screens/CaptureScreen";
import { AlbumScreen } from "../screens/AlbumScreen";
import { SharedWithMeScreen } from "../screens/SharedWithMeScreen";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { PaywallModal } from "../components/PaywallModal";

import { MCL_HUSKET_THEME } from "../theme";

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const dict = useMemo(() => getDict(settings.language), [settings.language]);

  const [life, setLife] = useState<LifeKey>("private");
  const [route, setRoute] = useState<RouteKey>("capture");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);

    // if premium turned off, ensure life is valid
    const customEnabled = [
      next.lives.enabledCustom1 ? "custom1" : null,
      next.lives.enabledCustom2 ? "custom2" : null,
    ].filter(Boolean) as LifeKey[];

    const allowed: LifeKey[] = ["private", "work", ...customEnabled];
    if (!allowed.includes(life)) setLife("private");
  };

  const requirePremium = () => {
    setPaywallOpen(true);
  };

  const activatePremiumMock = () => {
    const next: Settings = { ...settings, premium: true };
    updateSettings(next);
    setPaywallOpen(false);
  };

  const onSavedGoAlbum = () => setRoute("album");

  return (
    <ToastProvider>
      <div className="appShell" style={{ backgroundColor: MCL_HUSKET_THEME.colors.bg }}>
        <TopBar
          dict={dict}
          settings={settings}
          life={life}
          onLifeChange={(nextLife) => setLife(nextLife)}
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

        {route === "shared" ? <SharedWithMeScreen dict={dict} /> : null}

        <SettingsDrawer
          dict={dict}
          open={drawerOpen}
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
  );
}
