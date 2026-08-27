# Sentra app

The customer-facing half of Sentra: it explains why a payment was stopped, and lets a
guardian the customer trusts clear a hold after speaking to them.

One app serves both people. A guardian is not a separate build — they are a Sentra user who
sees an approval card when someone who trusts them needs it.

## Running

```bash
flutter pub get
flutter run
```

## Demo mode

`lib/services/demo_data.dart` seeds a realistic account so every screen — including the
interception and a guardian approval — can be explored without a bank partner or a running
API. `SentraApi` is the real client; flip `AppConfig.useDemoData` to false to point it at a
live API.
