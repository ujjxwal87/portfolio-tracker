"""Headless Dhan access-token refresh — removes the daily manual-login step.

DhanHQ access tokens expire every 24h. Instead of logging in on the web and pasting a fresh
DHAN_ACCESS_TOKEN into .env each day, this generates one on the fly from the credentials that
never expire: DHAN_CLIENT_ID, DHAN_PIN, and DHAN_TOTP_SECRET (the setup secret behind the
authenticator QR code, not a 6-digit code — pyotp derives the current code from it the same
way an authenticator app would).

  export DHAN_CLIENT_ID=...
  export DHAN_PIN=...
  export DHAN_TOTP_SECRET=...

get_access_token() below fetches a fresh token every call. Callers needing many requests
across one run should call it once and reuse the result, same as the old env-var token.
"""
import os
import requests

AUTH_URL = "https://auth.dhan.co/app/generateAccessToken"


def get_access_token():
    client_id = os.getenv("DHAN_CLIENT_ID")
    pin = os.getenv("DHAN_PIN")
    totp_secret = os.getenv("DHAN_TOTP_SECRET")
    if not (client_id and pin and totp_secret):
        raise SystemExit("set DHAN_CLIENT_ID, DHAN_PIN and DHAN_TOTP_SECRET "
                          "(or set DHAN_ACCESS_TOKEN directly to skip auto-refresh)")

    import pyotp  # only needed on this path — DHAN_ACCESS_TOKEN callers shouldn't require it
    totp = pyotp.TOTP(totp_secret).now()
    r = requests.post(AUTH_URL, params={"dhanClientId": client_id, "pin": pin, "totp": totp},
                       timeout=30)
    if not r.ok:
        raise SystemExit(f"Dhan token refresh failed ({r.status_code}): {r.text[:300]}")
    body = r.json()
    token = body.get("accessToken")
    if not token:
        raise SystemExit(f"Dhan token refresh returned no accessToken: {body}")
    print(f"  refreshed Dhan token for {body.get('dhanClientName', client_id)}, "
          f"expires {body.get('expiryTime')}")
    return token
