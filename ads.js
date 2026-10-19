// ── Monetization: AdMob interstitial/rewarded ads + "Remove Ads" IAP ──────────
// Native-only (no bundler in this project — plugins are called directly via
// window.Capacitor.Plugins, which Capacitor's native runtime auto-registers).
//
// TODO before your next App Store submission:
//   1. Replace the test ad unit IDs below with your real ones from admob.google.com
//   2. Replace GADApplicationIdentifier in ios/App/App/Info.plist with your real AdMob App ID
//   3. Create an in-app purchase in App Store Connect with product ID REMOVE_ADS_PRODUCT_ID below
//      (type: Non-Consumable)
//
// No App Tracking Transparency prompt: ads here are non-personalized (IDFA is
// never requested), via UMP consent only (requestConsentInfo/showConsentForm
// below) — the plugin's requestTrackingAuthorization() is marked deprecated
// upstream and intentionally unused. Don't add NSUserTrackingUsageDescription
// back to Info.plist or call that method unless you actually start requesting
// personalized ads — either one requires real ATT handling and an updated App
// Privacy declaration in App Store Connect (Identifiers > Device ID, used for
// tracking, purpose: Third-Party Advertising).

const ADS_IS_NATIVE = !!(window.Capacitor?.isNativePlatform?.());
const AdMobPlugin = () => window.Capacitor?.Plugins?.AdMob;
const PurchasesPlugin = () => window.Capacitor?.Plugins?.NativePurchases;

const REMOVE_ADS_PRODUCT_ID = 'com.kinhang.guessnextcard.removeads';

// Google's public test ad unit IDs — safe to ship during development, must be
// swapped for real ones before release or AdMob will flag/reject the account.
const AD_UNIT_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/5135589807';
const AD_UNIT_REWARDED_IOS     = 'ca-app-pub-3940256099942544/1712485313';

const INTERSTITIAL_EVERY_N_GAMES = 1; // show after every Nth game end; tune to taste

let adsRemoved = false;
let interstitialReady = false;
let rewardedReady = false;
let gamesSinceInterstitial = 0;

try { adsRemoved = localStorage.getItem('ddd_ads_removed') === '1'; } catch {}

function persistAdsRemoved(val) {
  adsRemoved = val;
  try { localStorage.setItem('ddd_ads_removed', val ? '1' : '0'); } catch {}
}

// ── Setup ──────────────────────────────────────────────────────────────────────
async function initMonetization() {
  if (!ADS_IS_NATIVE) return;
  window.refreshRemoveAdsVisibility?.(); // show cached state immediately, don't block on the store
  checkAdsRemoved(); // fire-and-forget — a slow/stuck StoreKit query must never block AdMob setup
  await initAdMob();
  if (!adsRemoved) {
    prepareInterstitial();
    prepareRewarded();
  }
}

async function initAdMob() {
  const AdMob = AdMobPlugin();
  if (!AdMob) return;
  try {
    await AdMob.initialize();
    const consentInfo = await AdMob.requestConsentInfo();
    if (consentInfo.isConsentFormAvailable && consentInfo.status === 'REQUIRED') {
      await AdMob.showConsentForm();
    }
    AdMob.addListener('interstitialAdDismissed', () => { interstitialReady = false; prepareInterstitial(); });
    AdMob.addListener('interstitialAdFailedToShow', () => { interstitialReady = false; prepareInterstitial(); });
    AdMob.addListener('onRewardedVideoAdDismissed', () => { rewardedReady = false; prepareRewarded(); });
    AdMob.addListener('onRewardedVideoAdFailedToShow', () => { rewardedReady = false; prepareRewarded(); });
  } catch (e) { console.warn('AdMob init failed', e); }
}

// ── Interstitial: shown between games ───────────────────────────────────────────
async function prepareInterstitial() {
  const AdMob = AdMobPlugin();
  if (!AdMob || adsRemoved) return;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNIT_INTERSTITIAL_IOS });
    interstitialReady = true;
  } catch (e) { interstitialReady = false; }
}

async function maybeShowInterstitialAfterGame() {
  if (!ADS_IS_NATIVE || adsRemoved) return;
  gamesSinceInterstitial++;
  if (gamesSinceInterstitial < INTERSTITIAL_EVERY_N_GAMES) return;
  gamesSinceInterstitial = 0;
  const AdMob = AdMobPlugin();
  if (!AdMob || !interstitialReady) return;
  try {
    await AdMob.showInterstitial();
  } catch (e) { /* ad not ready — just skip this round, no-op */ }
}

// ── Rewarded: "watch an ad to skip the dare" ────────────────────────────────────
async function prepareRewarded() {
  const AdMob = AdMobPlugin();
  if (!AdMob || adsRemoved) return;
  try {
    await AdMob.prepareRewardVideoAd({ adId: AD_UNIT_REWARDED_IOS });
    rewardedReady = true;
  } catch (e) { rewardedReady = false; }
}

function canShowRewarded() {
  return ADS_IS_NATIVE && !adsRemoved && rewardedReady;
}

// Resolves true only if the user actually watched to completion and earned the reward.
function showRewardedToSkip() {
  return new Promise(async (resolve) => {
    const AdMob = AdMobPlugin();
    if (!AdMob || !rewardedReady) { resolve(false); return; }
    let earned = false;
    const sub = await AdMob.addListener('onRewardedVideoAdReward', () => { earned = true; });
    try {
      await AdMob.showRewardVideoAd();
    } catch (e) {
      earned = false;
    } finally {
      sub.remove();
      resolve(earned);
    }
  });
}

// ── "Remove Ads" in-app purchase ────────────────────────────────────────────────
async function checkAdsRemoved() {
  const Purchases = PurchasesPlugin();
  if (!Purchases) return adsRemoved;
  try {
    const { purchases } = await Purchases.getPurchases({ productType: 'inapp' });
    const owned = purchases?.some(t => t.productIdentifier === REMOVE_ADS_PRODUCT_ID);
    persistAdsRemoved(!!owned);
  } catch (e) { /* keep cached local value if the store can't be reached */ }
  window.refreshRemoveAdsVisibility?.(); // re-sync the UI whenever this resolves, however late
  return adsRemoved;
}

async function fetchRemoveAdsProduct() {
  const Purchases = PurchasesPlugin();
  if (!Purchases) return null;
  try {
    const { product } = await Purchases.getProduct({ productIdentifier: REMOVE_ADS_PRODUCT_ID, productType: 'inapp' });
    return product; // use product.title / product.priceString in UI — never hardcode price text
  } catch (e) { return null; }
}

async function purchaseRemoveAds() {
  const Purchases = PurchasesPlugin();
  if (!Purchases) return { ok: false, cancelled: false, message: 'Purchases are not available right now.' };
  try {
    const tx = await Purchases.purchaseProduct({ productIdentifier: REMOVE_ADS_PRODUCT_ID, productType: 'inapp' });
    if (tx) { persistAdsRemoved(true); return { ok: true }; }
    return { ok: false, cancelled: false, message: 'Purchase could not be completed. Please try again.' };
  } catch (e) {
    const msg = e?.message || '';
    if (msg === 'User cancelled') return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, message: 'Purchase failed. Please try again later.' };
  }
}

async function restorePurchases() {
  const Purchases = PurchasesPlugin();
  if (!Purchases) return false;
  try { await Purchases.restorePurchases(); } catch (e) {}
  return checkAdsRemoved();
}

initMonetization();
