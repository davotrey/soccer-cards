// Authentication — handles Google sign-in/out and auth state
// Uses Firebase Authentication for user accounts

let _currentUser = null;
let _authReady = false;
const _authCallbacks = [];

// Returns the currently signed-in user, or null
function getCurrentUser() {
  return _currentUser;
}

// Waits for Firebase to determine if user is signed in (runs once on app load)
function onAuthReady(callback) {
  if (_authReady) {
    callback(_currentUser);
  } else {
    _authCallbacks.push(callback);
  }
}

// Listen for auth state changes (sign-in, sign-out, page reload)
firebaseAuth.onAuthStateChanged((user) => {
  _currentUser = user || null;
  _authReady = true;

  // Run any queued callbacks
  while (_authCallbacks.length > 0) {
    _authCallbacks.shift()(_currentUser);
  }

  // Update the sign-in UI on the dashboard
  updateAuthUI();

  // If user just signed in, kick off a full cloud sync
  if (user && typeof syncOnSignIn === 'function') {
    syncOnSignIn();
  }
});

// Sign in with Google popup
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
    // onAuthStateChanged will handle the rest
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return; // User cancelled
    if (e.code === 'auth/cancelled-popup-request') return;
    console.error('Sign-in error:', e);
    alert('Sign-in failed. Please try again.');
  }
}

// Sign out (local data stays on device — nothing is deleted)
async function signOutUser() {
  try {
    if (typeof stopSyncListener === 'function') stopSyncListener();
    await firebaseAuth.signOut();
  } catch (e) {
    console.error('Sign-out error:', e);
  }
}

// Refreshes the auth strip on the dashboard (if it exists on screen)
function updateAuthUI() {
  const strip = document.getElementById('auth-strip');
  if (!strip) return;

  if (_currentUser) {
    const name = _currentUser.displayName || _currentUser.email || 'User';
    strip.innerHTML = `
      <span class="auth-signed-in">Signed in as <strong>${name}</strong></span>
      <a class="auth-link" onclick="signOutUser()">Sign Out</a>`;
  } else {
    strip.innerHTML = `
      <button class="btn-google-signin" onclick="signInWithGoogle()">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google to sync
      </button>`;
  }
}
