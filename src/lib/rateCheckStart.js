// src/lib/rateCheckStart.js
// Where "Check My Rate" goes from anywhere outside the landing page: the start of the
// Rate Check flow (/?start=1 opens "Which policies do you have?"), tagged with the page
// it came from so the lead shows its source.
export const rateCheckStart = (source) =>
  `/?start=1${source ? `&utm_source=${encodeURIComponent(source)}&utm_medium=website` : ''}`;
