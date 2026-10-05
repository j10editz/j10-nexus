## Status
**Current Status**: “Stripe branding guide prepared — manual Dashboard configuration and visual acceptance pending.”

Do not claim branding completed until the CEO uploads the assets and a newly generated Portal visibly shows the J10 logo, business name, and colors on desktop and mobile.

---

## 1. Stripe Dashboard Navigation Path

1. Log in to the Stripe Dashboard in **Test Mode** (or Live mode for production):
   - **Direct URL**: `https://dashboard.stripe.com/test/settings/branding`
   - **Navigation**: Click the **Settings** (gear icon) in the top right → Under **Business Settings**, select **Branding**.
2. For Customer Portal specific features:
   - **Direct URL**: `https://dashboard.stripe.com/test/settings/billing/portal`
   - **Navigation**: Click **Settings** → Under **Billing**, select **Customer portal**.

---

## 2. Branding Settings Configuration

| Field | Setting / Value | Status / Evidence |
| :--- | :--- | :--- |
| **Business Name** | `J10 NEXUS` | Canonical business name |
| **Icon** (Square) | Upload `public/brand/j10-logo.png` | **Verified**: 1254 x 1254 px, 1:1 square, RGBA transparent, contains only the approved J10 square monogram. |
| **Logo** (Horizontal) | *Pending CEO Asset Upload* | **Held**: `public/brand/j10-logo.png` is square monogram only. Do not distort square icon into horizontal logo. Awaiting official horizontal wordmark PNG from CEO. |
| **Brand Color** | `#2F6BFF` | J10 Primary Brand Blue |
| **Accent Color** | `#00D9FF` | J10 Electric Cyan |
| **Support Email** | *Pending Verified Mailbox* | **Held**: DNS query for `j10nexus.com` returned `ENOTFOUND` (domain has no DNS/MX records). `support@j10nexus.com` is unverified and non-functional. Must provide working mailbox. |
| **Support Website** | `https://j10-nexus.vercel.app/contact` | **Verified Live**: HTTP 200 on public production Vercel deployment. |
| **Terms of Service** | `https://j10-nexus.vercel.app/terms` | **Verified Live**: HTTP 200 on public production Vercel deployment. |
| **Privacy Policy** | `https://j10-nexus.vercel.app/privacy` | **Verified Live**: HTTP 200 on public production Vercel deployment. |

---

## 3. Brand Asset Inspection Report

- **Square Icon Asset**:
  - Exact Filename: `public/brand/j10-logo.png`
  - Dimensions: 1254 × 1254 pixels
  - Aspect Ratio: 1:1 (Square)
  - Color Depth / Transparency: 8-bit/color RGBA (Fully transparent background)
  - Resolution: 72 DPI
  - Content: Approved J10 geometric monogram ONLY (no wordmark text)
  - Suitability: Certified for Stripe Icon (square).

- **Horizontal Logo Asset**:
  - Status: **MISSING / AWAITING CEO PROVISION**
  - Details: In-app header renders the wordmark dynamically in SVG/React (`components/brand/J10Logo.tsx`). No approved horizontal raster PNG (`J10 NEXUS` wordmark with transparent background) exists in the repository.
  - Action Required: CEO must provide the approved horizontal wordmark PNG (minimum 512 × 128 px, transparent background) for Stripe Logo upload. Do not substitute or stretch the square monogram.

---

## 4. Customer Portal Configuration (`/settings/billing/portal`)

Under **Customer portal configuration**:
1. **Branding**: Verify **"Use branding settings"** is active so the icon, logo, and brand color are applied automatically.
2. **Subscription Cancellation**:
   - **Cancellation behavior**: Set to **"Cancel at end of billing period"**.
   - **Cancellation reason**: Enabled (Customer feedback).
3. **Invoicing**:
   - Allow customers to view and download past paid invoices and receipts.
4. **Payment methods**:
   - Allow customers to update their credit cards.

---

## 5. Verification Workflow

Once the CEO saves the Branding settings in the Stripe Dashboard with the approved assets:
1. Antigravity will generate a fresh sandbox Customer Portal session URL.
2. Antigravity will capture both Desktop and Mobile viewport visual evidence verifying:
   - J10 NEXUS logo and name
   - Accessible color contrast
   - Correct subscription details ($99/mo Founder's 3)
   - Invoice history and cancellation/reactivation controls.

