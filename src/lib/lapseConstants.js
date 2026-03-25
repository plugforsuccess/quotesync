// Lapse portfolio points per product — used for Book Health scoring.
// Shared between BookHealthPage (display) and AuthContext (prefetch).
export const LAPSE_PORTFOLIO_POINTS = {
  auto:          10,
  ho:            20,  // Homeowners — always 1 item per policy
  condo:          0,  // Georgia statewide exclusion — Agency Bonus 2026
  renters:        5,
  landlord:      20,  // same points as HO but tracked separately
  specialty_auto: 5,
  pup:            0,  // Georgia statewide exclusion — Agency Bonus 2026
  manufactured:   5,
  boat:           5,  // Boat Owners — always 1 item per policy
  motor_club:     0,  // Motor Club — not an Allstate VC Baseline product
  other:          0,
};
