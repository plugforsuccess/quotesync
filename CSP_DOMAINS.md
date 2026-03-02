# CSP Domain Registry

Reference for all domains in the Content-Security-Policy header (`vercel.json`).
Update this file when adding new third-party integrations.

| Service          | Domains                                                        | CSP Directives       |
|------------------|----------------------------------------------------------------|----------------------|
| Canopy           | `cdn.usecanopy.com`, `app.usecanopy.com`                       | script-src, frame-src, connect-src |
| Google Ads       | `www.googleadservices.com`, `googleads.g.doubleclick.net`, `www.google.com`, `google.com` | script-src, connect-src |
| Google Analytics | `www.google-analytics.com`, `www.googleapis.com`               | script-src, connect-src |
| GTM              | `www.googletagmanager.com`                                     | script-src, frame-src |
| Meta Pixel       | `connect.facebook.net`, `www.facebook.com`                     | script-src, connect-src |
| Twitter/X        | `platform.twitter.com`, `cdn.syndication.twimg.com`, `twitter.com`, `x.com` | script-src, style-src, frame-src |
| Supabase         | `*.supabase.co`, `wss://*.supabase.co`                         | connect-src          |
| Anthropic        | `api.anthropic.com`                                            | connect-src          |
| Twilio           | `api.twilio.com`                                               | connect-src          |
