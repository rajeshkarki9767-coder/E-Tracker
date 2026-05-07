# E Tracker — Expense Tracker PWA

A free, private, offline-first expense tracker. All data stored locally on device.

## 🚀 Deploy to GitHub + Vercel

### Step 1 — Push to GitHub
1. Create a new GitHub repo (e.g. `e-tracker`)
2. Upload ALL files in this folder maintaining the exact folder structure:
   ```
   e-tracker/
   ├── index.html
   ├── manifest.json
   ├── sw.js
   ├── ads.txt
   ├── vercel.json
   ├── README.md
   ├── api/
   │   └── chat.js
   ├── icons/
   │   ├── icon-72.png ... icon-512.png
   │   └── screenshot.png
   └── public/
       └── .well-known/
           └── assetlinks.json
   ```

### Step 2 — Deploy on Vercel
1. Go to vercel.com → Add New Project → Import your GitHub repo
2. Leave all settings default → Deploy
3. Add Environment Variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (for AI chat feature)
4. Redeploy after adding the key

### Step 3 — AdSense Ad Slot IDs
In `index.html`, find and replace:
- `BANNER_SLOT_ID_HERE` → your banner ad unit ID
- `INTERSTITIAL_SLOT_ID_HERE` → your interstitial ad unit ID

Your Publisher ID `pub-7563052888132138` is already set.

### Step 4 — PWA Install
After deploying, users can install as an app:
- **Android (Chrome):** Menu → "Add to Home screen"
- **iPhone (Safari):** Share → "Add to Home Screen"
- **Desktop (Chrome/Edge):** Click the install icon in the address bar

## 📱 Play Store (TWA)
See SETUP_INSTRUCTIONS.md for Android app deployment.
Update `strings.xml` with your actual Vercel URL before building.

## 🔑 What to customise
| File | What to change |
|------|---------------|
| `index.html` | Replace `BANNER_SLOT_ID_HERE` and `INTERSTITIAL_SLOT_ID_HERE` |
| `strings.xml` | Replace `YOUR-APP.vercel.app` with real URL |
| `assetlinks.json` | Replace SHA256 fingerprint after generating keystore |
| `vercel.json` | Already configured, no changes needed |

## ✅ Checklist after deploy
- [ ] App loads at your Vercel URL
- [ ] Visit `https://yourapp.vercel.app/ads.txt` — should show your publisher ID
- [ ] Visit `https://yourapp.vercel.app/manifest.json` — should show app manifest
- [ ] On mobile Chrome: banner "Add to Home Screen" should appear
- [ ] In AdSense: add your Vercel URL under Sites for review
