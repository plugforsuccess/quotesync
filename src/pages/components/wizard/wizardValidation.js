// src/pages/components/wizard/wizardValidation.js
// Validation functions for each wizard step, separated for fast-refresh compatibility
import { isTargetZip } from '../../../config/targetZips';
import { isValidPhone } from '../../../utils/phoneFormat';

export function zipStepValidate(value) {
  if (!value || value.length !== 5) return 'Please enter a valid 5-digit ZIP code.';
  if (!isTargetZip(value)) return "We don't serve that area yet.";
  return null;
}

export function discountQualifierStepValidate(answers) {
  if (answers.ownsHome == null || answers.maritalStatus == null || answers.multipleDrivers == null)
    return 'Please answer all questions.';
  return null;
}

export function veteranStatusStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function productIntentStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function currentAutoCarrierStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function currentHomeCarrierStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function currentRentersCarrierStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function autoDrivingRecordStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function homeClaimsHistoryStepValidate(value) {
  if (value === null || value === undefined) return 'Please select one.';
  return null;
}

export function currentAutoPremiumStepValidate() {
  return null; // always valid — "Not sure" is a valid action
}

export function currentHomePremiumStepValidate() {
  return null; // always valid
}

export function coverageLapseStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function vehicleYearStepValidate(value) {
  if (!value) return 'Please select your vehicle year.';
  return null;
}

export function vehicleMakeStepValidate(value) {
  if (!value) return 'Please select your vehicle make.';
  return null;
}

export function vehicleModelStepValidate(value) {
  if (!value) return 'Please select your vehicle model.';
  return null;
}

export function vehicleUseStepValidate(value) {
  if (!value?.length) return 'Please select at least one.';
  return null;
}

export function earlyPhoneStepValidate(value) {
  if (value && !isValidPhone(value)) {
    return 'Please enter a valid 10-digit phone number.';
  }
  return null;
}

export function maritalStatusStepValidate(value) {
  if (!value) return 'Please select one.';
  return null;
}

export function dobStepValidate(value) {
  if (!value) return 'Please enter your date of birth.';
  const dob = new Date(value + 'T00:00:00');
  if (isNaN(dob.getTime())) return 'Please enter a valid date.';
  const now = new Date();
  const age = (now - dob) / (365.25 * 24 * 60 * 60 * 1000);
  if (age < 18) return 'You must be 18 or older to request an insurance quote.';
  if (age > 120) return 'Please enter a valid date of birth.';
  return null;
}

export function addressStepValidate(street, city) {
  if (!street || street.trim().length < 5) return 'Please enter your full street address.';
  if (!city || city.trim().length < 2) return 'Please enter your city.';
  return null;
}

export function contactStepValidate(firstName, lastName, phone, email) {
  const errors = {};
  const namePattern = /^[a-zA-Z\s'-]+$/;

  if (!firstName?.trim() || firstName.trim().length < 2) {
    errors.firstName = 'Please enter your first name.';
  } else if (!namePattern.test(firstName.trim())) {
    errors.firstName = 'Please enter a valid name.';
  }

  if (!lastName?.trim() || lastName.trim().length < 2) {
    errors.lastName = 'Please enter your last name.';
  } else if (!namePattern.test(lastName.trim())) {
    errors.lastName = 'Please enter a valid name.';
  }

  if (!phone || !isValidPhone(phone)) {
    errors.phone = 'Please enter a valid 10-digit phone number.';
  }

  if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Validate the current step. Returns error string/object or null.
 */
export function validateStep(stepId, answers) {
  switch (stepId) {
    case 'zip': return zipStepValidate(answers.zip);
    case 'discountQualifier': return discountQualifierStepValidate(answers);
    case 'veteranStatus': return veteranStatusStepValidate(answers.veteranStatus);
    case 'productIntent': return productIntentStepValidate(answers.productIntent);
    case 'earlyPhone': return earlyPhoneStepValidate(answers.earlyPhone);
    case 'currentAutoCarrier': return currentAutoCarrierStepValidate(answers.currentAutoCarrier);
    case 'currentHomeCarrier': return currentHomeCarrierStepValidate(answers.currentHomeCarrier);
    case 'currentRentersCarrier': return currentRentersCarrierStepValidate(answers.currentRentersCarrier);
    case 'currentAutoPremium': return currentAutoPremiumStepValidate();
    case 'currentHomePremium': return currentHomePremiumStepValidate();
    case 'coverageLapse': return coverageLapseStepValidate(answers.coverageLapse);
    case 'vehicleYear': return vehicleYearStepValidate(answers.vehicleYear);
    case 'vehicleMake': return vehicleMakeStepValidate(answers.vehicleMake);
    case 'vehicleModel': return vehicleModelStepValidate(answers.vehicleModel);
    case 'vehicleUse': return vehicleUseStepValidate(answers.vehicleUse);
    case 'autoDrivingRecord': return autoDrivingRecordStepValidate(answers.autoDrivingRecord);
    case 'homeClaimsHistory': return homeClaimsHistoryStepValidate(answers.homeClaimsHistory);
    case 'dob': return dobStepValidate(answers.dob);
    case 'address': return addressStepValidate(answers.street, answers.city);
    case 'contact': return contactStepValidate(answers.firstName, answers.lastName, answers.phone, answers.email);
    case 'canopyHome': return null;
    case 'homeInsuranceStatus': return answers.homeInsuranceStatus ? null : 'Please select one.';
    case 'homeOccupancyType': return answers.homeOccupancyType ? null : 'Please select one.';
    case 'roofReplacedRecently': return answers.roofReplacedRecently !== null && answers.roofReplacedRecently !== undefined ? null : 'Please select one.';
    case 'propertyDetails':
      if (!answers.yearBuilt) return { yearBuilt: 'Required' };
      if (!answers.squareFootage) return { squareFootage: 'Required' };
      if (!answers.stories) return { stories: 'Required' };
      return null;
    case 'confirmation': return null;
    default: return null;
  }
}
