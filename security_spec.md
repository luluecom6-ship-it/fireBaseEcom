# Firestore Security Specification - Lulu Matrix WMS

## 1. Data Invariants
- **Identity Integrity**: Every document containing an `empId` or acting as a user profile must belong to the authenticated user.
- **Admin Supremacy**: Users with the `admin` role (verified via `/users/{uid}`) have broad read/write access to system configurations and all user profiles.
- **Immutability**: `empId` and `createdAt` fields must never change after creation.
- **Role Locking**: Users cannot elevate their own roles.
- **Active Only**: Operations generally require the user profile to be `status: "Active"`.

## 2. The "Dirty Dozen" Payloads (Deny Cases)

1. **Identity Spoofing**: Create a profile in `/users/hacker_id` with `empId: "victim_id"`.
2. **Privilege Escalation**: Update `/users/my_id` with `{ role: 'admin' }`.
3. **Ghost Config**: Update `/system/config` as a non-admin.
4. **Token Theft**: Read `/fcm_tokens` collection as a non-admin to scrape device tokens.
5. **Orphaned Presence**: Create `/presence/victim_id` as `hacker_id`.
6. **Alert Sabotage**: Delete an alert from `/alerts` as a non-admin.
7. **Junk ID**: Create a document in `/users/` with a 2KB junk character string as ID.
8. **Malicious Presence**: Update `/presence/my_id` with a 1MB payload in a single field.
9. **Fake Verification**: Try to update own profile as `email_verified: false` user.
10. **Shadow Field**: Add `isVerifiedBySystem: true` to `/users/my_id` during a standard profile update.
11. **Future Timestamp**: Set `updatedAt` to a future date instead of `request.time`.
12. **Status Bypass**: Set alert state to `Acknowledged` without being a valid personnel assigned to that store/region.

## 3. Test Runner (Conceptual) - firestore.rules.test.ts
```typescript
// Test 1: User cannot modify another user's profile
// expect(db.collection('users').doc('user_A').set({ name: 'Hacked' }, { auth: 'user_B' })).toDeny();

// Test 2: Only admin can modify system settings
// expect(db.doc('system/config').update({ scheduledThreshold: 100 }, { auth: 'non_admin' })).toDeny();
```
