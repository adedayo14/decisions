# Fixing App Scopes - Action Required

## Issue
The app configuration has been successfully deployed with the correct scopes (`read_orders,read_products`), but the install screen still shows old permissions.

## Why This Happens
Shopify preserves scope grants for existing installations. When you update an app's scopes in `shopify.app.toml`, the changes only apply to **new installations**, not existing ones.

## Solution - Uninstall and Reinstall

### Step 1: Uninstall the App
1. Go to: https://blunt-brew.myshopify.com/admin/settings/apps
2. Find "Decisions" in the list
3. Click the app name
4. Click "Uninstall app"
5. Confirm the uninstall

### Step 2: Reinstall the App
Run this command to get a fresh install URL:
```bash
npx shopify app dev
```

This will:
- Start the development server
- Give you a URL to install the app
- The installation will now use the NEW scopes (only read_orders and read_products)

### Step 3: Verify Scopes
During reinstall, you should now see ONLY these permissions:
- ✅ **View orders** - All order details for the last 60 days
- ✅ **View products** - Products or collections

You should NOT see:
- ❌ "View personal data"
- ❌ "View store data" (as a separate broad permission)

## Current Status
- ✅ App configuration deployed (version: decisions-4)
- ✅ Scopes correctly set in shopify.app.toml
- ✅ Shopify Partners Dashboard updated
- ⏳ Waiting for uninstall/reinstall to apply new scopes

## Verification
After reinstalling, the app should:
1. Successfully authenticate
2. Fetch orders from the last 90 days
3. Fetch product variant costs
4. Generate profit decisions based on the 3 rules
5. Display decisions in the UI
