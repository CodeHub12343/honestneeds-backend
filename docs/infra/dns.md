# DNS + redirects — HonestNeed

> This document is the single source of truth for apex-domain redirects owned
> by HonestNeed. Edits here must be followed by a verification run of
> `tests/infra/redirects.sh` (post-deploy, from outside our network).

## Owned apex domains

| Apex                            | Owner    | Notes                                             |
| ------------------------------- | -------- | ------------------------------------------------- |
| honestneed.com                  | HonestNeed | Primary. `www.honestneed.com` serves the Next.js app. |
| battlebuddiesforvets.com        | HonestNeed (transferred before DNS change — see §Risk) | Redirects to `/veterans/*`. |

## battlebuddiesforvets.com → /veterans redirect (TASK-8.1)

**Goal.** `https://battlebuddiesforvets.com/<path>` and
`https://www.battlebuddiesforvets.com/<path>` return `301 Moved Permanently`
to `https://www.honestneed.com/veterans/<path>` with the path, query string
and fragment preserved. Scheme must always be HTTPS at the destination; a
plain-HTTP incoming request still redirects (via the TLS edge) with the same
301.

**Implementation.** Terminate TLS at the same edge/CDN that already serves
honestneed.com and configure a `Redirect` rule for every host on
`battlebuddiesforvets.com`. In practice this is one rule per CDN:

- **Cloudflare** (preferred — it is already in front of honestneed.com):
  Create a *Bulk Redirect List* `battle_buddies_vets_301` with two source
  URLs, each targeted at the apex and `www` host, matching the path
  `/*`, preserving `path_suffix` and `query_string`, 301, SSL on both
  sides. The list is attached by a Bulk Redirect rule from the
  `battlebuddiesforvets.com` zone to the HonestNeed account.
- Any other CDN implementing this rule MUST preserve path and query
  verbatim and respond `HTTP/1.1 301` (not 302 — the browser cache invariant
  matters for SEO).

**DNS records.** On the `battlebuddiesforvets.com` zone:

- `A @` → the CDN edge IPv4 (or `CNAME @ cdn-cname` where the registrar
  supports CNAME flattening).
- `AAAA @` → the CDN edge IPv6.
- `CNAME www @` (or the CDN's recommended apex-pointing form).
- `CAA 0 issue "letsencrypt.org"` + the CDN's extra CAA entries, so no
  rogue cert can be issued.
- `TXT @ "v=spf1 -all"` and `TXT _dmarc "v=DMARC1; p=reject; rua=mailto:..."` —
  the domain never sends email; a hard-fail SPF + DMARC reject stops it
  being used as a spoof source.

**Risk mitigation (per decision §14.11).** Transfer the apex to the
HonestNeed registrar account **before** flipping DNS; a domain in flight is a
hijack risk. Once the AuthCode has been consumed and the WHOIS shows
HonestNeed ownership, make the DNS change in a single commit and run the
post-deploy verification immediately.

## Verifying the redirect

Run `bash tests/infra/redirects.sh` from a workstation whose DNS is not
seeded by the HonestNeed office network, so the resolver walks public DNS
rather than returning a cached private answer. The script expects a 301 +
exact Location header on three different paths and query strings, and runs
the same assertions through three public resolvers (`1.1.1.1`, `8.8.8.8`,
`9.9.9.9`) to catch a partially-propagated change.

An ok run prints `OK` lines only; any `FAIL` line is a release blocker.

## Rollback

Point `A @` back to the previous host and let the CDN redirect rule stay in
place — the rule is harmless when the DNS doesn't resolve to the CDN. If the
domain itself is compromised, pull the DNS records to NXDOMAIN rather than
leaving them pointing at an attacker.
