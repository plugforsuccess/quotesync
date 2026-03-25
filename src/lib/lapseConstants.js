// ⚠️  This file exports a fallback for AuthContext prefetch only.
// All components with agencyId should use config.portfolioPoints from useAgencyProductConfig instead.

// Georgia/Allstate 2026 defaults — used only before agency config loads
export const LAPSE_PORTFOLIO_POINTS = {
  auto:           10,
  ho:             20,
  condo:           0,  // Georgia statewide exclusion — Agency Bonus 2026
  renters:         5,
  landlord:       20,
  specialty_auto:  5,
  pup:             0,  // Georgia statewide exclusion — Agency Bonus 2026
  manufactured:    5,
  boat:            5,
  motor_club:      0,
  other:           0,
};

// Helper: get portfolio points from DB config, falling back to the above
export function getPortfolioPoints(productKey, config) {
  return config?.portfolioPoints?.[productKey] ?? LAPSE_PORTFOLIO_POINTS[productKey] ?? 0;
}
