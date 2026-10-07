# Order Alert + security hardening - branch test notes

Branch: `feature/order-article-alert` (nothing here touches `main`).

## What's new
- WhatsApp **Order Alert** for watched article numbers (Admin > Settings card).
  One alert per order+article, from order creation until delivery, sent to the
  store's fulfillment group. Never re-sent once logged as `sent` in `order_alert_log`.
  Runs on the existing ~10 min monitor cycle (config cached 10 min).
- `src/services/authGuard.ts`: verifies the Firebase ID token server-side.
  - New Order Alert endpoints: token required, admin only.
  - `manual-item-push`, `scan-and-send`, `send-oos-push`: token accepted; the old
    client-supplied role is still accepted until `ENFORCE_ADMIN_TOKEN=true`.
- `firestore.rules`: `oos_history` is no longer public (server/Admin SDK only).
  **Rules are NOT live until you run `firebase deploy --only firestore:rules`.**

- **Common groups by region** (Admin > Order Alert card): add as many extra WhatsApp groups as you
  like; each has its own On/Off switch and region choice (specific regions or All). A store
  alerts its own fulfillment group plus every enabled common group covering its region. Sent once per
  order+article per group (log id `..__common_<groupId>`). The earlier single common group is
  carried over automatically as an "All regions" group. Uses the main instance.

## Safe testing checklist
1. Use a Vercel *preview* deployment of this branch (not production).
   Preview shares the production Firebase project/WhatsApp config -> keep the
   Order Alert toggle OFF, add one test SKU, point a test store's fulfillment
   mapping at a test WhatsApp group, then turn it on briefly.
2. Admin > Order Alert card: add SKU, "Send test message" to your test group.
3. Wait one monitor cycle; check the "Recent alerts" table (sent / failed).
4. Server logs: look for `[AuthGuard] ... accepted via legacy` lines. If the
   three existing endpoints show `token` working (no legacy warnings), set
   `ENFORCE_ADMIN_TOKEN=true` on the preview and re-test, then on production.
5. Optional env: `ADMIN_EMAILS=a@x.com,b@y.com` (verified e-mails treated as admin).

## Not included (deliberately)
- Moving `whatsappApiKey` out of client-readable `system/config`.
- Auth for the older endpoints (users upsert/delete, broadcast-push, migrate-users, archive-logs).
