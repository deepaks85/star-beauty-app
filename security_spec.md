# Security Specification — Start Beauty Make-up Studio

## 1. Data Invariants
1. **Service Menu Integrity**: `/services/{serviceId}` documents are publicly readable for storefront browsing, and only verified administrators (`email_verified == true`) can create, update, or delete services. Prices must be positive numbers and durations bounded between 15 and 480 minutes.
2. **Staff & Schedule Integrity**: `/staff/{staffId}` stores only public professional metadata (no email, phone, or salary PII). Only verified administrators can modify staff profiles or weekly shift schedules.
3. **Customer PII Isolation**: `/customers/{customerId}` stores customer PII (`email`, `phone`, `notes`). Read and write access is strictly isolated to `request.auth.uid == customerId` (with `uid == request.auth.uid`) or verified admins. Blanket `list` queries are restricted to verified admins.
4. **Appointment Ownership & Payment Math**: `/appointments/{appointmentId}` documents enforce:
   - On customer creation: `customerUid == request.auth.uid`, `status == 'Confirmed'`, `totalAmount > 0`, `amountPaid > 0`, `amountPaid <= totalAmount`, `balanceDue == totalAmount - amountPaid`, and referenced `serviceId` & `staffId` must exist (`exists(...)`).
   - Customers may only `get` or `list` appointments where `resource.data.customerUid == request.auth.uid`.
   - Customers may only update their own non-terminal appointments to set `status: 'Cancelled'` (and `updatedAt: request.time`).
   - Terminal states (`Completed`, `Cancelled`) are locked against customer modifications; only verified admins can transition or settle balance payments.
5. **Attendance Confidentiality**: `/attendance/{attendanceId}` is strictly Admin-only for `get`, `list`, `create`, `update`, and `delete`, and `create` verifies the referenced `staffId` exists.
6. **Temporal Integrity & Anti-Update-Gap**: All `createdAt` fields must equal `request.time` on creation and remain immutable on updates; all `updatedAt` fields must equal `request.time` on both creation and update. All IDs match `^[a-zA-Z0-9_-]+$` and all strings enforce explicit `.size()` bounds.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Appointment Create**: Customer A (`uid: cust_1`) submits `customerUid: "cust_2"` -> **DENIED** (`incoming().customerUid == request.auth.uid`).
2. **Shadow / Ghost Field Injection**: Customer includes `"isVipDiscount": true` or `"adminOverride": true` in appointment payload -> **DENIED** (`data.keys().hasOnly(...)`).
3. **Unverified Email Spoofing**: Attacker signs in with `email: "deepaks85@gmail.com"` and `email_verified: false` -> **DENIED** (`request.auth.token.email_verified == true`).
4. **Privilege Escalation via `/admins` Write**: Non-admin user attempts to write `/admins/{myUid}` -> **DENIED** (admin-only write).
5. **Blanket Customer PII Scraping**: Authenticated customer runs `list` on `/customers` -> **DENIED** (`isAdminEmail()` required for list).
6. **Cross-Customer PII Read**: Customer A runs `get` on `/customers/cust_2` -> **DENIED** (`isOwner(customerId) || isAdmin()`).
7. **Orphaned Service Reference**: Customer books appointment referencing nonexistent `serviceId: "fake_svc"` -> **DENIED** (`exists(/databases/$(database)/documents/services/$(incoming().serviceId))`).
8. **Payment Math Tampering**: Customer submits `totalAmount: 5000, amountPaid: 0, balanceDue: 0, paymentStatus: "Paid in Full"` -> **DENIED** (`amountPaid > 0` and `balanceDue == totalAmount - amountPaid` and paymentStatus consistency).
9. **Terminal State Resurrection**: Customer attempts to update a `Completed` or `Cancelled` appointment back to `Confirmed` -> **DENIED** (terminal state lock).
10. **Immutable Field Overwrite**: Customer attempts to alter `amountPaid`, `totalAmount`, or `createdAt` when cancelling their appointment -> **DENIED** (`affectedKeys().hasOnly(['status', 'updatedAt'])`).
11. **ID Poisoning / Resource Exhaustion**: Attacker targets `/appointments/` with a 500-character ID containing `/` or spaces -> **DENIED** (`isValidId(appointmentId)`).
12. **Client-Forged Timestamp**: Client submits `createdAt: Timestamp(2020-01-01)` instead of `serverTimestamp()` -> **DENIED** (`incoming().createdAt == request.time`).
