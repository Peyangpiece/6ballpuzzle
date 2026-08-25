import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getDatabase, ref, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const config = window.LIVEGATE_FIREBASE_CONFIG;
const LOCAL_KEY = "livegate-next-profile";
let app;

function readLocalProfile() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeLocalProfile(key, value) {
  const current = readLocalProfile();
  current[key] = value;
  current.updatedAtLocal = Date.now();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(current));
}

const bridge = {
  connected: false,
  databaseConnected: false,
  uid: null,
  async savePreference(key, value) {
    writeLocalProfile(key, value);
    if (!this.connected || !this.uid || !app) return;
    try {
      const db = getDatabase(app);
      await update(ref(db, `livegate-next/users/${this.uid}`), {
        [key]: value,
        updatedAt: serverTimestamp()
      });
      this.databaseConnected = true;
      document.documentElement.dataset.firebaseDatabase = "connected";
    } catch (error) {
      this.databaseConnected = false;
      document.documentElement.dataset.firebaseDatabase = "restricted";
      console.warn("Live Gate Realtime Database sync is restricted; local fallback is active:", error?.message || error);
    }
  }
};
window.liveGateFirebase = bridge;

try {
  app = initializeApp(config);
  const auth = getAuth(app);

  const localProfile = readLocalProfile();
  if (Object.keys(localProfile).length && typeof window.applyFirebaseProfile === "function") {
    window.applyFirebaseProfile(localProfile);
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    bridge.connected = true;
    bridge.uid = user.uid;
    document.documentElement.dataset.firebase = "authenticated";

    try {
      const db = getDatabase(app);
      const snap = await get(ref(db, `livegate-next/users/${user.uid}`));
      if (snap.exists()) {
        bridge.databaseConnected = true;
        document.documentElement.dataset.firebaseDatabase = "connected";
        const remoteProfile = snap.val();
        localStorage.setItem(LOCAL_KEY, JSON.stringify(remoteProfile));
        if (typeof window.applyFirebaseProfile === "function") {
          window.applyFirebaseProfile(remoteProfile);
        }
      }
    } catch (error) {
      bridge.databaseConnected = false;
      document.documentElement.dataset.firebaseDatabase = "restricted";
      console.warn("Live Gate Realtime Database read is restricted; local fallback is active:", error?.message || error);
    }
  });

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
} catch (error) {
  console.warn("Live Gate Firebase Authentication initialization failed:", error?.message || error);
  document.documentElement.dataset.firebase = "offline";
}
