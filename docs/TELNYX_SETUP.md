# Texting with Telnyx: setup

QuoteSync sends these texts through Telnyx:
- Quick Send links
- **Send Text** in the sales workspace
- the upload form's verification code

It also handles replies: STOP, START, HELP, and "Y" to a quote. Until the steps below are done, those features fall back to opening Messages on your own phone, the same as today.

The old automatic lead drips, the new-lead alert texts and the call features are **not** connected to Telnyx. They stay off.

## 1. In Telnyx (you)

1. **Buy a number.** Go to Numbers → Search & Buy. Pick a local Georgia number (404, 470, 678 or 770) with **SMS** turned on.
2. **Create a messaging profile.** Go to Messaging → Create a profile named "Cam Wiley Agency".
   - **Inbound webhook URL:** `https://ghnpzllykteelveezhnv.supabase.co/functions/v1/telnyx-sms-inbound`
   - **Webhook API version:** 2 (API v2).
   - Assign the number you bought to this profile.
   - Leave Telnyx's automatic **STOP** reply on. QuoteSync records the opt-out but doesn't send its own STOP reply, so they won't double up.
3. **Register for business texting (10DLC).** Go to Messaging → 10DLC, then use the copy in section 3 below.
   - Register the **Brand**: your company.
   - Register the **Campaign**: what you text and how people sign up.
   - When the campaign is approved, attach the number to it. Approval usually takes days to a couple of weeks.
4. **Make an API key.** Go to Account → API Keys → Create. Don't paste it in chat.

## 2. In Supabase (you)

Go to Project Settings → Edge Functions → **Secrets** and add:

| Secret | Value |
|---|---|
| `TELNYX_API_KEY` | the API key from step 4 |
| `TELNYX_FROM_NUMBER` | your new number, like `+14045551234` |
| `TELNYX_PUBLIC_KEY` | Telnyx → Account → Keys & Credentials → **Public Key** (checks that replies really come from Telnyx) |
| `TELNYX_MESSAGING_PROFILE_ID` | optional: the profile's ID |
| `SMS_TEST_ONLY_TO` | **while testing:** your cell number (10 digits; separate several with commas). Nobody else gets texted. |

Then tell Claude it's ready. We'll test with your phone only:
- a Quick Send link
- the "Delivered" status showing in Quick Send
- a reply forwarded to your cell
- STOP and START
- the verification code

When everything works and the campaign is approved, delete `SMS_TEST_ONLY_TO` to go live.

## 3. 10DLC registration copy (paste and adjust)

**Brand**
- Legal name: Cam Wiley Agency, Inc. (must match your IRS EIN letter exactly)
- EIN, business address, phone and email: yours
- Website: https://insuredbycam.com
- Vertical: Insurance

**Campaign**
- Use case: **Low Volume Mixed**. It covers verification codes, customer care and quote notifications, and is cheaper under about 2,000 texts a day.
- Description:
  > Cam Wiley Agency, Inc., an Allstate insurance agency in Georgia, texts people who ask us for an insurance quote: the secure link they requested to upload their current policy, a one-time verification code, a notice when their quote is ready with an invitation to reply Y for a call, and replies to their questions. We also text our referral affiliates their sign-up link. We do not buy lists or send cold texts.
- How people opt in:
  > (1) On insuredbycam.com, the rate check form has an optional, unchecked box: "Text me when my quote is ready. By checking this, you agree to receive automated texts from Cam Wiley Agency, Inc. at the number above about your insurance quote… Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Not required to get a quote." (2) In person or on the phone, the person asks for the upload link and we text that one link (the producer reads them: "Can I text you a secure link to upload your current dec page?"). (3) A person requests a verification code on our website. Opt-in is never pre-checked or required.
- Sample messages:
  1. `insuredbycam.com (Cam Wiley Agency, Inc.): Here is the secure link you requested to upload your dec page for an agent-prepared quote: https://insuredbycam.com/r/K7PM2QXD`
  2. `Your Cam Wiley Agency code is 482913. It expires in 10 minutes.`
  3. `Hi Dana, it's Cam with Cam Wiley Agency. Good news: the same coverage with Allstate comes to $1,860 a year, saving you $540. Reply Y and I'll call to set it up. Reply STOP to opt out.`
- Opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
- Opt-out reply: Telnyx's default.
- Help keywords and reply: HELP. `Cam Wiley Agency: insurance quotes and reminders. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`
- Embedded links: yes (insuredbycam.com). Phone numbers: yes. Age-gated content: no. Direct lending: no.

Carriers expect the first text someone gets to say who it's from and how to opt out. Before going live, add "Reply STOP to opt out" to the quote-ready texts in **Texts & Scripts**.
