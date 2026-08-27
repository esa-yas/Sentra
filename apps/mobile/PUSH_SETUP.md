# Push notifications — what to get, and where

Push is not decoration here. A held payment and a guardian approval are both time-critical: if
the phone is in a pocket, a notification is the only thing that reaches the person before the
window closes. Everything below is a one-time setup; nothing in the app changes afterwards.

Two platforms, two credentials. Android is free; iOS needs a paid Apple account.

## Android — Firebase Cloud Messaging (free, ~15 minutes)

1. Go to <https://console.firebase.google.com> and **Add project** (name it `Sentra`).
   Analytics is optional — skip it.
2. In the project, click the **Android** icon to add an app.
   - Package name: `io.sentra.app` (must match `applicationId` in the Android build file).
   - Download **`google-services.json`** and send it to me.
3. Left sidebar → gear icon → **Project settings** → **Service accounts** →
   **Generate new private key**. This downloads a JSON file.
   **Send me that JSON** — the server uses it to send notifications.

> Treat the service-account JSON like a password: it can send notifications as Sentra. Send it
> over something private, and never commit it.

## iOS — Apple Push Notification service (needs a $99/yr Apple Developer account, ~20 minutes)

1. Enrol at <https://developer.apple.com/programs/> if you have not already.
2. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles** → **Keys** →
   **+** to create a key.
   - Name it `Sentra Push`.
   - Tick **Apple Push Notifications service (APNs)**.
   - **Continue → Register → Download**. You get a **`.p8` file**, which can only be
     downloaded once.
3. Note these three things and send them with the file:
   - the **`.p8` file**
   - the **Key ID** (shown next to the key, e.g. `ABC123DEFG`)
   - your **Team ID** (top-right of the developer account page, e.g. `1A2B3C4D5E`)
4. Still in **Identifiers**, register an App ID of `io.sentra.app` with **Push Notifications**
   enabled.

## What I do with them

- Store the credentials as server environment variables (never in the app or in git).
- Register each device's push token against the signed-in user.
- Send on three events: **a payment was held**, **a guardian is needed**, and
  **a guardian link went live** after its waiting period.

## What the notifications say

Deliberately specific — a vague alert gets swiped away:

| Event | Notification |
|---|---|
| Payment held | "We've paused a payment on your account. Tap to review before it's sent." |
| Guardian needed | "Mum needs your approval — £3,000 to a new payee, held during a call." |
| Link went live | "Your guardian link with Sara is now active." |

They never contain an account number, a balance, or anything that would be damaging on a lock
screen a stranger can see.
