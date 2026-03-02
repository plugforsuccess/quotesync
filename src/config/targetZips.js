// src/config/targetZips.js
// Target ZIP codes for Cameron's territory

export const TARGET_ZIPS = [
  // Phase 1: Cameron's core territory
  // TODO: Cameron to populate with his 5-7 priority ZIP codes
  // Example format:
  // '30301', '30302', '30303', '30304', '30305', '30306', '30307',
];

// If array is empty, accept ALL Georgia ZIPs (starts with 3)
export const isTargetZip = (zip) => {
  if (TARGET_ZIPS.length === 0) {
    return zip.startsWith('3') && zip.length === 5;
  }
  return TARGET_ZIPS.includes(zip);
};
