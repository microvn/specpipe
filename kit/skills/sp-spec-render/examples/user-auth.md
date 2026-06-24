# Spec: User Auth

**Created:** 2026-04-30
**Last updated:** 2026-05-14
**Status:** Active
**Snapshot limit:** 5

## Overview

Email + password authentication với session cookies, password reset qua email, optional remember-me 30 ngày. Mục tiêu: replace legacy middleware (JWT trong localStorage không meet compliance).

## Data Model

Entities: `User`, `Session`, `PasswordResetToken`. `Session` liên kết 1-N với `User`, TTL 30 ngày rolling khi có activity. `PasswordResetToken` single-use, TTL 1h, invalidate hết session khác khi reset thành công.

## Stories

### S-001: Login với email + password (P0)

**Description:** User nhập email + password → POST `/api/login` → match credentials qua bcrypt → tạo session row + set cookie `sid` (HttpOnly, Secure, SameSite=Lax) → redirect `/dashboard`. Sai password trả lỗi generic. Quá 5 lần sai trong 15 phút → 429.

**Acceptance Scenarios:**

AS-001: Login thành công với credential đúng
- **Given:** user `jane@acme.com` tồn tại, password đúng, không có session active
- **When:** POST `/api/login` với `{email, password}`
- **Then:** Response 200, set cookie `sid` (HttpOnly, Secure, SameSite=Lax), INSERT session row
- **Data:** email=`jane@acme.com`, password=`correct-horse-battery-staple`

AS-002: Sai password trả lỗi generic, không leak user tồn tại
- **Given:** user tồn tại nhưng password sai (hoặc user không tồn tại)
- **When:** POST `/api/login`
- **Then:** Response 401 với `"Invalid email or password"`. Không phân biệt 2 trường hợp ở message hay timing.

AS-003: Quá 5 lần sai → 429 trong 15 phút
- **Given:** 5 lần login fail liên tiếp cùng (email, IP) trong 15 phút
- **When:** Lần thứ 6 POST `/api/login`
- **Then:** Response 429 với header `Retry-After: 900`, dù password đúng cũng từ chối
- **Data:** Đếm theo cặp (email, IP) — tránh attacker spam từ IP khác khoá user thật

### S-002: Logout (P0)

**Description:** User click logout → server xoá session row, clear cookie, redirect `/login`.

**Acceptance Scenarios:**

AS-004: Logout xoá session DB + clear cookie
- **Given:** Session active, cookie `sid` hợp lệ
- **When:** POST `/api/logout`
- **Then:** Session row deleted, `Set-Cookie: sid=; Max-Age=0`, 302 → `/login`

AS-005: Logout khi không có session vẫn 200 (idempotent)
- **Given:** Không có cookie `sid` hoặc session đã expire
- **When:** POST `/api/logout`
- **Then:** Response 200, không lỗi. Idempotent.

### S-003: Password reset qua email (P1)

**Description:** User nhập email → backend tạo `PasswordResetToken` 32-char + send link → user click → đặt password mới → invalidate tất cả session khác.

**Acceptance Scenarios:**

AS-006: Request reset link gửi email (luôn 200 dù email tồn tại hay không)
- **Given:** Form reset password
- **When:** POST `/api/password-reset/request` với `{email}`
- **Then:** Response 200 generic `"Check your email"`. Nếu email tồn tại → gửi link, không tồn tại → no-op (anti-enumeration).

AS-007: Token expired (>1h) trả lỗi
- **Given:** Token tạo cách đây 65 phút
- **When:** POST `/api/password-reset/confirm` với token + new password
- **Then:** Response 410 `"Token expired"`

AS-008: Reset thành công invalidate tất cả session khác
- **Given:** User có 3 session active (laptop, phone, tablet), token còn hạn
- **When:** Reset password thành công
- **Then:** 3 session bị xoá, user phải login lại trên cả 3 thiết bị, token reset bị mark used

### S-004: Remember-me cookie (P2)

**Description:** Checkbox "Remember me" trong form login → session TTL 30 ngày rolling thay vì 24h.

**Acceptance Scenarios:**

AS-009: Tick remember → cookie Max-Age 30 ngày
- **Given:** Form login có checkbox "Remember me" được tick
- **When:** Login thành công
- **Then:** Cookie `sid` có `Max-Age=2592000` (30 ngày), session row có `extended=true`

## Constraints & Invariants

- C-001: Bcrypt cost 12 cho mọi password. Không dùng SHA*, không dùng PBKDF2. Migration từ legacy phải re-hash lúc login lần đầu.
- C-002: Cookie `sid` luôn `HttpOnly`, `Secure`, `SameSite=Lax`. Domain scope tới apex, không subdomain.
- C-003: Password tối thiểu 12 ký tự, zxcvbn score ≥ 3. Không bắt buộc ký tự đặc biệt (NIST 800-63B).
- C-004: Login error message generic — không leak user tồn tại hay không.
- C-005: Rate limit theo cặp `(email, IP)` rolling 15 phút.

## What Already Exists

Legacy middleware ở `src/middleware/auth-legacy.ts` dùng JWT lưu localStorage — đây là cái cần thay (compliance flagged). Bcrypt utility đã có ở `src/lib/crypto/hash.ts`, reuse. Rate limit helper `src/lib/rate-limit.ts` đã có cho API publicly-facing — reuse cho login.

## Not in Scope

- OAuth / SSO — defer phase 2
- 2FA / TOTP — separate spec, planned Q3
- Email change flow — defer V1+
- Audit log UI — log có ghi DB nhưng không expose UI

## Change Log

| Date | Change | Ref |
|------|--------|-----|
| 2026-05-14 | Add S-004 Remember-me (P2) | — |
| 2026-05-08 | S-003 priority P2 → P1 sau review compliance | JIRA-1428 |
| 2026-04-30 | Initial creation | — |
