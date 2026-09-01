# Sentra × Bank demo — the real end-to-end flow

A demo bank (open-source template by Martin Yovo, migrated to Dart 3) with the **Sentra SDK**
wired at its transfer screen. A payment that looks like a scam is stopped by Sentra's own screen —
over the bank's app — before any money moves, and the whole thing is recorded by the real Sentra
backend.

## What's real here
- **Bank app** — a local account seeded with **$30,000**, persisted on the device. Real payee,
  real amount, real balance that only changes when a payment is actually allowed.
- **SDK → API** — the app calls the live Sentra API (`POST /v1/sdk/protection-sessions`) with a
  secret key, exactly as a bank would. Open → answer → resolve.
- **The interception** — Sentra's engine decides the verdict, the copy and the questions; the SDK
  renders them. The bank ships no scam logic.
- **The backend records everything** — every session, every answer, every outcome, and the
  per-signal learning update, in Postgres.

## Run it (on the iPhone)

1. Start the Sentra API + database (real mode):
   ```bash
   pnpm dev:infra && pnpm --filter @sentra/api run dev   # or: pnpm dev:real
   ```
2. Run the bank app on the device, pointing at this Mac's LAN address so the phone can reach the API:
   ```bash
   cd apps/bank-demo
   flutter run -d 00008130-001238200CC3001C \
     --dart-define=SENTRA_API_URL=http://172.20.10.5:3001
   ```

The SDK's default key (`sk_test_sentrademo000banksdemo01`) is seeded for the sandbox bank org.
Regenerate it any time with the mint step in `scripts` (see commit message) if the DB is reset.

## The demo script
1. Open **Send Money**.
2. Pick **J. Smith (new)** and turn on **"I'm on a call with an unknown number"**.
3. Enter **$3,000** and tap **Send Money**.
4. Sentra's **"Stop — this looks like a scam"** screen appears, asks a question or two, and — once
   answered — advises a hold. Tap **Cancel this payment**.
5. Back on the bank screen: the balance is **unchanged**, and the held payment is recorded.
6. Try again paying **Mum** with the switch off → it sails straight through and the balance drops.

Behind the scenes, the API recorded both sessions; the held one taught the engine a confirmed
scam. That data is queryable in the Sentra console.

---

## Connecting the account (the real handoff)

Both apps installed on the same iPhone. Sentra opens the bank to authorise — Sentra never sees a
banking credential.

1. **Sentra app** → sign in → **Connect your bank** → tap **Sandbox Bank**.
2. Sentra deep-links into the **bank app**, which shows *"Connect Sentra to your account?"* with
   exactly what Sentra can and can't see, and **Connect with Face ID** / **Cancel**.
3. Approve with **Face ID**. The bank redirects back to Sentra (`sentra://bank-callback?code=…`)
   and Sentra finishes linking.
4. In the **bank app → Profile**, the account now shows **"Protected by Sentra"** (with a
   Disconnect option). From here the transfer demo above runs with protection live.

Run both, pointing the bank at this Mac so the phone reaches the API:

```bash
# Sentra app
cd apps/mobile && flutter run -d 00008130-001238200CC3001C \
  --dart-define=SENTRA_API_URL=http://192.168.8.84:3001

# Bank app (second terminal)
cd apps/bank-demo && flutter run -d 00008130-001238200CC3001C \
  --dart-define=SENTRA_API_URL=http://192.168.8.84:3001
```

Developer docs for the SDK and this connection flow are on the console at **/docs**
(*Mobile SDK* and *Connecting a customer's account*).
