// src/data/vehicleModels.js — Vehicle models by make for the Save Wizard
// Top models per make. "Other" is always appended at render time.

const VEHICLE_MODELS = {
  bmw: ['3 Series', '5 Series', 'X3', 'X5', 'X1', '4 Series', '7 Series', 'X7', 'iX', 'i4'],
  chevrolet: ['Silverado', 'Equinox', 'Tahoe', 'Traverse', 'Malibu', 'Trailblazer', 'Colorado', 'Camaro', 'Suburban', 'Blazer'],
  dodge: ['Ram 1500', 'Challenger', 'Charger', 'Durango', 'Hornet', 'Ram 2500', 'Grand Caravan', 'Journey', 'Ram 3500', 'Nitro'],
  ford: ['F-150', 'Explorer', 'Escape', 'Bronco', 'Edge', 'Mustang', 'Ranger', 'Expedition', 'Maverick', 'F-250'],
  gmc: ['Sierra 1500', 'Terrain', 'Yukon', 'Acadia', 'Canyon', 'Sierra 2500', 'Yukon XL', 'Sierra 3500', 'Envoy', 'Hummer EV'],
  honda: ['Civic', 'CR-V', 'Accord', 'HR-V', 'Pilot', 'Odyssey', 'Ridgeline', 'Passport', 'Fit', 'Insight'],
  hyundai: ['Tucson', 'Elantra', 'Santa Fe', 'Sonata', 'Kona', 'Palisade', 'Venue', 'Ioniq 5', 'Accent', 'Santa Cruz'],
  jeep: ['Grand Cherokee', 'Wrangler', 'Cherokee', 'Compass', 'Gladiator', 'Renegade', 'Wagoneer', 'Grand Wagoneer', 'Liberty', 'Patriot'],
  kia: ['Forte', 'Sportage', 'Sorento', 'Telluride', 'Soul', 'Seltos', 'K5', 'Carnival', 'Niro', 'EV6'],
  mercedes: ['C-Class', 'E-Class', 'GLC', 'GLE', 'A-Class', 'S-Class', 'GLA', 'GLB', 'CLA', 'G-Class'],
  nissan: ['Rogue', 'Altima', 'Sentra', 'Pathfinder', 'Frontier', 'Kicks', 'Murano', 'Versa', 'Titan', 'Leaf'],
  subaru: ['Outback', 'Forester', 'Crosstrek', 'Impreza', 'Ascent', 'WRX', 'Legacy', 'BRZ', 'Solterra', 'Baja'],
  toyota: ['Camry', 'RAV4', 'Corolla', 'Tacoma', 'Highlander', '4Runner', 'Tundra', 'Prius', 'Sienna', 'Venza'],
  volkswagen: ['Jetta', 'Tiguan', 'Atlas', 'Taos', 'Golf', 'ID.4', 'Passat', 'Arteon', 'Atlas Cross Sport', 'GTI'],
  // Fallback for makes not in the top 14
  acura: ['MDX', 'RDX', 'TLX', 'Integra', 'ILX'],
  audi: ['A4', 'Q5', 'A3', 'Q7', 'A6', 'Q3', 'e-tron'],
  buick: ['Encore', 'Enclave', 'Envision', 'Encore GX'],
  cadillac: ['Escalade', 'XT5', 'CT5', 'XT4', 'CT4', 'Lyriq'],
  chrysler: ['Pacifica', '300', 'Voyager'],
  genesis: ['G70', 'G80', 'GV70', 'GV80', 'G90'],
  infiniti: ['QX60', 'QX50', 'Q50', 'QX80', 'Q60'],
  jaguar: ['F-Pace', 'E-Pace', 'XF', 'XE', 'I-Pace'],
  'land rover': ['Range Rover', 'Discovery', 'Defender', 'Range Rover Sport', 'Evoque'],
  lexus: ['RX', 'NX', 'ES', 'IS', 'GX', 'UX', 'TX'],
  lincoln: ['Corsair', 'Nautilus', 'Aviator', 'Navigator'],
  mazda: ['CX-5', 'Mazda3', 'CX-50', 'CX-9', 'CX-30', 'MX-5 Miata'],
  mini: ['Cooper', 'Countryman', 'Clubman'],
  mitsubishi: ['Outlander', 'Eclipse Cross', 'Mirage', 'Outlander Sport'],
  porsche: ['Cayenne', 'Macan', '911', 'Taycan', 'Panamera'],
  ram: ['1500', '2500', '3500', 'ProMaster'],
  tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'],
  volvo: ['XC90', 'XC60', 'XC40', 'S60', 'S90', 'V60', 'C40'],
};

export function getModelsForMake(make) {
  if (!make) return [];
  const key = make.toLowerCase().replace(/-benz$/i, '');
  return VEHICLE_MODELS[key] || [];
}

export default VEHICLE_MODELS;
