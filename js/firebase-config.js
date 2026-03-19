// Firebase initialization — connects the app to your Firebase project
// Replace the placeholder values below with your actual Firebase config

const firebaseConfig = {
  apiKey: "AIzaSyCb0lTzn0dq4iUPA-pwuJ7F5cLvXcBoVrg",
  authDomain: "topps-prem-cards.firebaseapp.com",
  projectId: "topps-prem-cards",
  storageBucket: "topps-prem-cards.firebasestorage.app",
  messagingSenderId: "1001080872359",
  appId: "1:1001080872359:web:77452caee4bef6d221aa82"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Global references used by auth.js and sync.js
const firebaseAuth = firebase.auth();
const firebaseDB = firebase.firestore();

// Enable offline persistence (queues writes when offline, syncs when back online)
firebaseDB.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open — persistence only works in one tab at a time
    console.warn('Firestore persistence unavailable: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support persistence
    console.warn('Firestore persistence not supported in this browser');
  }
});
