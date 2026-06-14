<div align="center">

<img src="logo.png" width="100" height="100" style="border-radius: 24px" />

# Kosha · कोश

**Your private, AI-powered personal finance dashboard — built for India 🇮🇳**

[![Made with React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![100% Local](https://img.shields.io/badge/Data-100%25%20Local-22c55e?style=flat-square&logo=database)](.)
[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6?style=flat-square)](LICENSE)
[![Deploy on Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)

[**Try it Live →**](https://kosha.vercel.app) &nbsp;·&nbsp; [Report Bug](../../issues) &nbsp;·&nbsp; [Request Feature](../../issues)

</div>

---

## 🔒 Your data never leaves your device

No accounts. No servers. No subscriptions. Everything is stored in your browser — private by design.

---

## ✨ What it does

| | Feature | Details |
|---|---|---|
| 🤖 | **AI PDF Analyser** | Drop any bank statement PDF — Gemini reads it instantly |
| 📊 | **Smart Dashboard** | 5 financial meters + net worth + cash flow forecast |
| 🎯 | **Savings Goals** | Track goals with progress bars & monthly targets |
| 💳 | **Debt & EMI Tracker** | Payoff timelines, interest totals, due date alerts |
| 🧾 | **India Tax Estimator** | Old vs New regime comparison for FY 2024-25 |
| 💡 | **AI Insights** | Gemini analyses your finances & gives personal advice |
| 📁 | **CSV Import** | HDFC · ICICI · SBI · Axis Bank formats supported |
| 📈 | **Investments** | Track stocks, MF, FD, gold with P&L |
| 🏦 | **Budgets** | Category-wise limits with real-time alerts |
| 🩺 | **Health Score** | 0–100 financial wellness score with grade |

---

## 🚀 Get started in 60 seconds

### Use online (no install)
```
Visit → https://kosha.vercel.app
```

### Run locally
```bash
git clone https://github.com/GGNIDHI/kosha.git
cd kosha
npm install
npm run dev
```
Open **http://localhost:5173**

### Install as desktop / mobile app
> Open the site in Chrome → click the **install icon** (⊕) in the address bar → done.  
> On iPhone: Safari → Share → **Add to Home Screen**

### 🖥️ 1-Click Desktop Launchers (With Auto-Start Server & Setup Wizard)
If you run Kosha locally, you can use the pre-built desktop launchers in the root folder. **These launchers feature a built-in onboarding setup wizard** so you don't even need to use the terminal to run `npm install` or configure options:

#### 🍏 For macOS (Mac)
Use **`Kosha Launcher.app`**:
1. Copy/drag **`Kosha Launcher.app`** to your **Applications** folder or onto your **Dock**.
2. Double-click to open. 
   * **First Run**: It will prompt you to automatically install dependencies and let you input your Name, Currency, API Keys, and Port via a series of popup dialogs.
   * **Next Runs**: It starts the Vite server silently in the background and opens the dashboard immediately.
3. *Note: Since the bundle is downloaded from GitHub, macOS Gatekeeper may block it initially. To run it, right-click -> Open, or run this quick command in your terminal once to clear quarantine flags:*
   ```bash
   xattr -cr "Kosha Launcher.app"
   ```

#### 🔌 For Windows (PC)
Use **`Kosha Launcher.bat`**:
1. Double-click **`Kosha Launcher.bat`** in the project folder.
   * **First Run**: A popup dialog will ask to automatically run the setup. It will run `npm install` and guide you through configuration steps (Name, Currency, API Keys, Port) via popup input boxes.
   * **Next Runs**: It launches the server in the background and opens the dashboard.
2. You can right-click **`Kosha Launcher.bat`** -> **Create Shortcut** and drag that shortcut to your Desktop or pin it to your Start menu for quick access.

---

## 🔑 API Keys (optional — for AI features only)

The AI PDF parser and insights need a free Gemini key.  
Get one at **[aistudio.google.com](https://aistudio.google.com)** → paste it in **Settings**.

> All other features (budgets, goals, investments, tax, CSV import) work with zero API keys.

---

## 🛠 Built with

`React 18` · `TypeScript` · `Vite` · `Dexie (IndexedDB)` · `Recharts` · `Gemini AI` · `PDF.js`

---

## 📄 License

MIT — free to use, fork, and build on.

---

<div align="center">

Made with ❤️ for India &nbsp;|&nbsp; [⭐ Star this repo](.) if you find it useful!

</div>
