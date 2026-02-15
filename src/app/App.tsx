// ===============================
// src/app/App.tsx
// ===============================
import React, { useMemo, useState } from "react";
import type { LifeKey, Settings } from "../domain/types";
import { loadSettings, saveSettings } from "../data/settingsRepo";
import { getDict } from "../i18n";
import { ToastProvider, useToast } from "../components/ToastHost";
import { TopBar } from "../components/TopBar";
import { BottomNav } from "../components/BottomNav";
import type { RouteKey } from "./routes";
import { CaptureScreen } from "../screens/CaptureScreen";
import { AlbumScreen } from "../screens/AlbumScreen";
import { SharedWithMeScreen } from "../screens/SharedWithMeScreen";
import { SettingsDrawer } from "../components/SettingsDrawer";
import { PaywallModal } from "../components/PaywallModal";
import { MCL_HUSKET_THEME } from "../theme";
import { FlyToTargetProvider } from "../animation/FlyToTargetProvider";

import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

export function App() {
  return (
    <ToastProvider>
      <FlyToTargetProvider>
        <AppInner />
      </FlyToTargetProvider>
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const dict = useMemo(() => getDict(settings.language), [settings.language]);

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

    // Always keep at least one valid life selected
    const fallback: LifeKey = allowed[0] ?? "private";
    if (!allowed.includes(life)) setLife(fallback);
  };

  const requirePremium = () => {
    setPaywallOpen(true);
  };

  const activatePremiumMock = () => {
    const next: Settings = { ...settings, premium: true };
    updateSettings(next);
    setPaywallOpen(false);
  };

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fallthrough
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  const onDevCreateInviteCode = async () => {
    try {
      const fn = httpsCallable(functions, "createInviteCode");
      const res = await fn({});
      const code =
        (res.data as any)?.code ?? (typeof res.data === "string" ? (res.data as string) : "");

      if (!code) {
        toast.show("Sky code: (no code returned)");
        return;
      }

      const copied = await copyToClipboard(code);
      toast.show(copied ? `Sky code: ${code} (copied)` : `Sky code: ${code}`);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "Unknown error";
      toast.show(`Sky code failed: ${msg}`);
      // eslint-disable-next-line no-console
      console.error(err);
    }
  };

  return (
    <div
      className="appShell"
      style={{
        backgroundColor: MCL_HUSKET_THEME.colors.altSurface,
        color: MCL_HUSKET_THEME.colors.textOnDark,
        position: "relative",
      }}
    >
      <TopBar
        dict={dict}
        settings={settings}
        life={life}
        onLifeChange={(nextLife) => setLife(nextLife)}
        onOpenSettings={() => setDrawerOpen(true)}
        onDevCreateInviteCode={onDevCreateInviteCode}
      />

      {route === "capture" ? (
        <CaptureScreen dict={dict} life={life} settings={settings} onRequirePremium={requirePremium} />
      ) : null}

      {route === "album" ? (
        <AlbumScreen dict={dict} life={life} settings={settings} onAlbumBecameEmpty={() => setRoute("capture")} />
      ) : null}

      {route === "shared" ? <SharedWithMeScreen dict={dict} /> : null}

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
  );
}
