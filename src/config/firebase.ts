import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// TODO: replace placeholder values with your Firebase project settings.
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Initialize once for RN Firebase; safe if already initialized.
if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

export const firebaseAuth = auth();
export const db = firestore();

/**
 * Firebase console setup (manual steps):
 * 1) Create project at https://console.firebase.google.com.
 * 2) Enable Authentication → Sign-in method → Email/Password.
 * 3) Create two users in Authentication → Users:
 *    - your personal account (email + password)
 *    - device account for ESP32 (e.g. esp32-device@yourdomain.com + strong password)
 * 4) Enable Firestore Database (production mode).
 * 5) Apply security rules:
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /device/{doc} {
 *          allow read, write: if request.auth != null;
 *        }
 *        match /readings/{readingId} {
 *          allow read, write: if request.auth != null;
 *        }
 *      }
 *    }
 * 6) In Project Settings → General → Your apps → Add app (Android or iOS), download google-services.json / GoogleService-Info.plist and place as required for React Native Firebase.
 * 7) Copy your Firebase config values into this file (apiKey, projectId, etc.).
 */
