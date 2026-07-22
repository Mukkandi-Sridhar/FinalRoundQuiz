# ⚡ Live Quiz Competition Platform (GitHub Pages & Firebase Ready)

A sub-millisecond, low-latency real-time web application built with **Vanilla HTML5, CSS3, and JavaScript (ES6 Modules)**. Designed for high-stakes live quiz competitions featuring 20+ simultaneous teams where the **FIRST team to respond** is atomically declared the winner using **Firebase Realtime Database transactions**.

---

## 🌐 Deploying to GitHub Pages (Step-by-Step Guide)

GitHub Pages hosts static websites for FREE. Because GitHub Pages does not run back-end servers, **Firebase Realtime Database** provides the free cloud WebSocket backend for 20+ teams connecting from anywhere in the world.

### Step 1: Create a Free Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (name it e.g. `quiz-arena`).
3. Click **Build -> Realtime Database** in the left menu, then click **Create Database**.
4. Select your location and start in **Test mode**.
5. Under **Rules**, paste the following security rules and click **Publish**:
   ```json
   {
     "rules": {
       ".read": true,
       "quizState": {
         ".write": true,
         "winner": {
           ".write": "!data.exists() || !newData.exists()"
         }
       },
       "submissions": { "$questionId": { "$teamId": { ".write": "!data.exists()" } } },
       "teams": { "$teamId": { ".write": true } },
       "questions": { ".write": true }
     }
   }
   ```

### Step 2: Copy Firebase Credentials into `firebase.js`
1. Go to **Project Settings** (gear icon) -> **General** -> **Your apps** -> Click `</>` (Web).
2. Copy the `firebaseConfig` object and paste it inside `firebase.js`:

```javascript
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "quiz-arena-123.firebaseapp.com",
  databaseURL: "https://quiz-arena-123-default-rtdb.firebaseio.com",
  projectId: "quiz-arena-123",
  storageBucket: "quiz-arena-123.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### Step 3: Push Code & Enable GitHub Pages
1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Deploy Live Quiz Arena to GitHub Pages"
   git push origin main
   ```
2. Go to your GitHub repository -> **Settings** -> **Pages**.
3. Under **Build and deployment**, select **Branch: main** and **Folder: / (root)**, then click **Save**.

🎉 Your Live Quiz App is now deployed globally!
- **Landing Portal**: `https://<username>.github.io/<repository-name>/`
- **Admin Control Panel**: `https://<username>.github.io/<repository-name>/admin.html`
- **Team Participant Arena**: `https://<username>.github.io/<repository-name>/team.html`

---

## 📁 Project Structure

```
├── index.html           # Competition Landing & Entry Portal
├── admin.html           # Host & Admin Control Center Dashboard
├── team.html            # Touch-friendly Team Participant Interface
├── style.css            # Dark Glassmorphism Design System & Responsive Layouts
├── firebase.js          # Firebase & Multi-Engine Wrapper
├── websocket.js        # Local WebSocket Engine Client
├── server.js           # Zero-Dependency Local Wi-Fi Node Server (Alternative to Cloud)
├── database.rules.json  # Firebase Realtime Database Security Rules
├── 404.html             # GitHub Pages Redirect Route
└── README.md            # Deployment & Configuration Guide
```

---

## 🎮 How the Live Competition Runs

1. **Teams Join**: 20+ teams open `https://<username>.github.io/<repo>/team.html` on their smartphones.
2. **Host Activates Question**: Admin opens `admin.html` on a projector laptop and clicks **▶️ START QUESTION**.
3. **Atomic Winner Lock**: The moment a team taps an option, Firebase `runTransaction` locks that team as the **First Team to Respond**.
4. **Instant Broadcast**: All participant screens and the projector instantly display the winner banner (e.g. **Team Phoenix - 0.72s**).
5. **Host Calls on Winner**: Admin manually asks that team for their answer out loud!
