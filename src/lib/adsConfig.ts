// Master ad switch. Set to false to pull every ad (and the AdSense loader
// script) off the site in one place — e.g. during an initial launch/review
// period — and back to true to restore them. Individual pages still opt in
// via the `ads` prop on BaseLayout; this just gates all of them at once.
export const ADS_ENABLED = false;
