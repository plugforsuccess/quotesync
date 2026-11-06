// Sales workspace: the message for a saved quote, by result. The producer can edit it
// before sending. Saves / same ask for a Y (a Y back flags them ready to call); costs
// more is an honest note that we'll check again before their next renewal. Quoted (no
// current price to compare, e.g. a winback) gives the price and asks for a Y.
const usd = (n) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

export function contactMessage(kind, { first, producer = 'Cam', allstate, diff }) {
  const hi = `Hi ${first || 'there'}, it's ${producer} with Cam Wiley Agency.`;
  if (kind === 'saves') {
    return `${hi} Good news: the same coverage with Allstate comes to ${usd(allstate)} a year, saving you ${usd(diff)}. Reply Y and I'll call to set it up.`;
  }
  if (kind === 'quoted') {
    return `${hi} I put together a new Allstate quote for you: ${usd(allstate)} a year. Reply Y and I'll call to go over it.`;
  }
  if (kind === 'same') {
    return `${hi} Your Allstate quote came in about the same as you pay now (${usd(allstate)} a year). Bundling and having a local agent may still make it worth a look. Reply Y for a quick call.`;
  }
  return `${hi} I checked your rate, and your current price is hard to beat right now. I'd rather tell you straight. We'll check again before your next renewal.`;
}
