/**
 * AdMob placeholder — ads are disabled until production build.
 * All functions are no-ops so nothing crashes.
 */

export async function initAds() {}

export async function showInterstitial(): Promise<boolean> {
  return false;
}

export async function showRewarded(): Promise<boolean> {
  return false;
}
