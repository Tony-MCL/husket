// ===============================
// src/theme/typography.ts
// ===============================
/**
 * Husket Typography System v1
 *
 * Prinsipp:
 * - Kun 2 nivåer: A (Primary) og B (Secondary)
 * - Ingen tilfeldige fontSize/fontWeight rundt om i appen
 * - Justeres sentralt her når vi evaluerer og tester
 */

export type TextStyle = {
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: number;
};

export const HUSKET_TYPO = {
  /**
   * Nivå A: Primary UI Text
   * Brukes til: TopBar-tabs, aktive navigasjonsvalg, "viktige" UI-valg.
   * Referanse: eksisterende TopBar pills (13px) som du liker.
   */
  A: {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: 0,
  } satisfies TextStyle,

  /**
   * Nivå B: Secondary UI Text
   * Brukes til: labels, valg-overskrifter ("Likte jeg dette?"), metadata, hjelpefelt.
   * Samme størrelse som A i v1 (for enhetlig uttrykk), men roligere vekt.
   * Hvis vi senere vil skille mer, gjør vi det her – ikke rundt i komponenter.
   */
  B: {
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 0,
  } satisfies TextStyle,
} as const;
