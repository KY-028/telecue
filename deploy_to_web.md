# 📦 Deploying an Expo Web App to a Server

This document outlines the steps to build and deploy your Expo web app to a server or hosting platform of your choice (e.g., DigitalOcean, AWS, custom VPS, Netlify, Vercel, etc.). 

---

## 🛠 Prerequisites

Before beginning, ensure you have:

- Node.js and npm/yarn installed
- Expo CLI installed (`npm install -g expo-cli`)
- EAS CLI installed (`npm install -g eas-cli` or `npx eas-cli`)
- A valid Expo account that's been invited to the organization
- Server/platform access (SSH, FTP, Git deployment, or CI/CD pipeline)
- A domain (optional)

---

## 1. 📦 Build Your Web App

### 1.1 Configure `app.json` (Optional but Recommended)

Make sure your `app.json` includes a web output mode that suits your deployment:

```json
{
  "expo": {
    "web": {
      "favicon": "./assets/telecue_logo.png",
      "bundler": "metro",
      "output": "server"
    },
  }
}
```

### 1.2 Export the Web Build

Export your web app into a `dist/` directory:

```bash
npx expo export --platform web
```

This generates optimized static assets in `dist/`. Re-run this command after **every change** before deployment.

---

## 2. 🧪 Test Locally

Quickly serve your build locally to confirm everything renders correctly:

```bash
npx expo serve dist
```

Visit the local URL printed in your terminal.

---

Absolutely — here’s an updated **deployment instructions template (Markdown)** that covers **Expo Web apps with `"web.output": "server"`** and explains how to get your app from GitHub to a variety of environments:

---

````markdown
# 🚀 Deploying an Expo Web App with `output: "server"`

This guide explains how to take an Expo web app configured with:

```json
"web": {
  "bundler": "metro",
  "output": "server"
}
````

(from your `app.json`) and deploy it to different environments — **self-hosted servers, server-capable platforms (Vercel, Render), EAS Hosting, and cloud VMs**. Expo’s `server` output means a **Node.js–style server build** with API routes alongside web assets, instead of a purely static site. ([Expo Documentation][1])

---

## 📌 Overview – What `output: "server"` Means

Setting `"output": "server"`:

* Produces both a **client build** and a **server directory**.
* Includes **API route handlers** as JavaScript functions.
* Requires hosting on a **Node.js–capable environment or server platform** (not just a static file host). ([Expo Documentation][1])

---

## 🧰 0. Prerequisites (Before Deployment)

Make sure:

* You have access to the server/hosting environment.
* Your team can **SSH into remote machines** or connect with GitHub (for cloud builds).
* Your repo is on GitHub and collaborators can clone it:

```bash
git clone git@github.com:your_org/your_repo.git
cd your_repo
```

---

## 1️⃣ Build the Web App

Before deploying anywhere, generate the web build:

```bash
# install dependencies
npm install

# build the web project
npx expo export --platform web
```

This generates a `dist/` folder with both client assets and a server entrypoint for Node environments. {!!IMPORTANT!!} Re-run this command **after every code change before deploying**. ([Expo Documentation][2])

---

## 2️⃣ Local Testing

To preview how the server build works locally:

```bash
node dist/server/index.js
```

Visit `http://localhost:3000` (or whatever port the server prints). Confirm routes and API endpoints behave as expected.

---

## 3️⃣ Deployment Options

### 📡 3A. EAS Hosting (Expo’s Managed Web + Server API Host)

Expo’s EAS Hosting lets you deploy your server and API routes without managing infra.

1. Install and log in:

   ```bash
   npm install -g eas-cli
   eas login
   ```

2. Build and deploy:

   ```bash
   npx expo export --platform web
   eas deploy --prod
   ```

   You’ll be prompted to choose or confirm a subdomain. This deploys to an Expo–managed edge host with custom domains and automatic TLS. ([Expo Documentation][2])

3. For GitHub Actions automation, refer to `.eas/workflows/deploy-web.yml`.

---

### 🧑‍💻 3B. Self-Hosted VPS or Custom Server (DigitalOcean / Cloud VM)

If you provide your own server (e.g., Ubuntu VM with SSH access):

1. **Clone the repo** on the server:

   ```bash
   git clone git@github.com:your_org/your_repo.git
   cd your_repo
   npm install
   ```

2. **Build the app** on the server:

   ```bash
   npx expo export --platform web
   ```

3. **Install Node.js** (if not installed):

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

4. **Run with a process manager** (e.g., PM2):

   ```bash
   npm install -g pm2
   pm2 start dist/server/index.js --name telecue-web
   pm2 save
   ```

5. **Configure your reverse proxy** (e.g., Nginx) to forward traffic:

   ```nginx
   server {
     listen 80;
     server_name yourdomain.com;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
     }
   }
   ```

---

### ☁️ 3C. Cloud Platforms with Node.js Support

#### 🟠 Vercel

1. Link your GitHub repo from Vercel Dashboard.
2. Set:

   * **Framework Preset:** None / Custom
   * **Build command:** `npx expo export --platform web`
   * **Output directory:** leave blank (Vercel will run a custom Node server)
3. Add a `vercel.json`:

```json
{
  "builds": [
    {
      "src": "dist/server/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "/dist/server/index.js" }
  ]
}
```

Vercel will treat `dist/server/index.js` as your Node handler.

#### 🔵 Render

Render supports **Web Services** with Node:

1. Create a new **Web Service** from your repo.
2. Build command:

   ```bash
   npm install
   npx expo export --platform web
   ```
3. Start command:

   ```bash
   node dist/server/index.js
   ```
4. Deploy via connected GitHub service.

Platforms like **Railway** and **Fly.io** follow similar patterns: install deps, build, and start Node.

---

## 4️⃣ Essential Tips

* **Always rebuild before deploying.** (`npx expo export --platform web`)
* **Server routes require Node-compatible hosting.** Static hosts (Netlify’s static CDN) won’t run server code.
* **Custom domains:** Set DNS to your server’s IP or use your cloud provider’s DNS tools.
* **Environment variables:** Use platform-specific tools (Render dashboard, Vercel env settings, EAS env config).

---

## 🗂 Summary – Which Hosting to Choose

| Platform                 | Node Server Support | Easy Setup | GitHub Integration |
| ------------------------ | ------------------- | ---------- | ------------------ |
| EAS Hosting              | ✨ Managed Edge      | 👍 Easy    | ✨ Can automate     |
| Self-hosted server (VPS) | ✅ Yes               | ⚙️ Manual  | Optional           |
| Vercel                   | ✅ Yes               | 👍 Medium  | 👍 Excellent       |
| Render                   | ✅ Yes               | 👍 Medium  | 👍 Good            |

---