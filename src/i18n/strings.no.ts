// ===============================
// src/i18n/strings.no.ts
// ===============================
export const no = {
  app: {
    title: "husket",
  },
  nav: {
    new: "Ny husket",
    album: "Album",
    shared: "Delt med meg",
  },
  top: {
    private: "Privat",
    work: "Jobb",
    menu: "Meny",
  },
  capture: {
    title: "Capture",
    pickPhoto: "Ta bilde-knapp",
    photoRequired: "Bilde er obligatorisk",
    like: "Likte jeg dette?",
    comment: "Kommentar",
    commentPh: "Maks 100 tegn…",
    category: "Kategori",
    save: "Lagre",
    saved: "Lagret",
    gpsSaved: "GPS lagret",
    gpsDenied: "GPS ikke tilgjengelig",
  },
  album: {
    empty: "Ingen husket'er enda.",
    open: "Åpne",
    created: "Opprettet",
    map: "Åpne i Maps",
    gps: "GPS",
  },
  settings: {
    title: "Innstillinger",
    language: "Språk",
    languageAuto: "Auto (telefon)",
    ratingPack: "Rating-sett",
    gpsGlobal: "GPS (globalt)",
    premium: "Premium",
    premiumOff: "Standard (gratis)",
    premiumOn: "Premium aktiv",
    buyPremium: "Kjøp Premium (mock)",
    premiumDesc:
      "Premium: ubegrenset lagring, 2 ekstra liv, flere rating-sett, egendefinerte kategorier.",
    lives: "Liv/modus",
    customLives: "Egendefinerte liv (Premium)",
    enable: "Aktiver",
    name: "Navn",
    categories: "Kategorier",
    customCats: "Egendefinerte kategorier (Premium, maks 3)",
    gpsPerCat: "GPS per kategori",
    close: "Lukk",
  },
  paywall: {
    title: "Premium",
    body:
      "Denne funksjonen er Premium. Aktiver Premium for å låse opp ubegrenset lagring, ekstra liv og egendefinerte kategorier.",
    cancel: "Avbryt",
    activate: "Aktiver Premium (mock)",
  },
  shared: {
    title: "Delt med meg",
    placeholder:
      "Skylagring/deling kommer senere. (Her blir det en egen feed når sync er på plass.)",
  },
} as const;
