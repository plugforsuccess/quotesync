// src/config/targetZips.js
// Target ZIP codes for Cameron's territory

export const TARGET_ZIPS = [
  // Phase 1: Cameron's core territory
  // TODO: Cameron to populate with his 5-7 priority ZIP codes
  // Example format:
  // '30301', '30302', '30303', '30304', '30305', '30306', '30307',
];

// F-08 fix: If array is empty, accept Georgia ZIPs only (300-319, 398-399)
// Previous version accepted any ZIP starting with '3' (included AL, FL, MS, TN)
export const isTargetZip = (zip) => {
  if (zip.length !== 5 || !/^\d{5}$/.test(zip)) return false;

  if (TARGET_ZIPS.length === 0) {
    // Georgia ZIP ranges: 300xx-319xx and 398xx-399xx
    return /^3(0[0-9]|1[0-9]|98|99)\d{2}$/.test(zip);
  }
  return TARGET_ZIPS.includes(zip);
};
