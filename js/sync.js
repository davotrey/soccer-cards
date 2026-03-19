// Cloud sync — pushes/pulls collection data and photos via Firestore
// Photos are stored as base64 strings in Firestore (no Firebase Storage needed)
// This is a background sync layer; the app works fully offline without it

let _syncListener = null;
let _syncPaused = false; // Prevents listener from re-applying our own writes

// ── Push a single card record to Firestore ──────────────

async function syncCardToCloud(cardNumber, action) {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const docRef = firebaseDB.collection('users').doc(user.uid)
      .collection('collection').doc(String(cardNumber));

    if (action === 'remove') {
      await docRef.delete();
      // Also delete the photo document
      deletePhotoFromCloud(user.uid, cardNumber);
    } else {
      // Read current local data to upload
      const record = await getCollectionStatus(cardNumber);
      if (!record) return;
      await docRef.set({
        cardNumber: record.cardNumber,
        collected: true,
        rarity: record.rarity || 'white',
        dateAdded: record.dateAdded || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  } catch (e) {
    console.warn('Cloud sync failed for card', cardNumber, e);
  }
}

// ── Push photo to Firestore as base64 ───────────────────

async function syncPhotoToCloud(cardNumber) {
  const user = getCurrentUser();
  if (!user) return;

  try {
    const photoData = await getPhoto(cardNumber);
    if (!photoData) return;

    const docRef = firebaseDB.collection('users').doc(user.uid)
      .collection('photos').doc(String(cardNumber));

    const data = {};
    if (photoData.photoBlob) {
      data.photo = await blobToBase64(photoData.photoBlob);
    }
    if (photoData.thumbnailBlob) {
      data.thumbnail = await blobToBase64(photoData.thumbnailBlob);
    }

    if (data.photo || data.thumbnail) {
      data.updatedAt = new Date().toISOString();
      await docRef.set(data);
    }
  } catch (e) {
    console.warn('Photo upload failed for card', cardNumber, e);
  }
}

// ── Delete photo from Firestore ─────────────────────────

async function deletePhotoFromCloud(uid, cardNumber) {
  try {
    await firebaseDB.collection('users').doc(uid)
      .collection('photos').doc(String(cardNumber)).delete();
  } catch (e) {
    // Ignore — photo may not exist in cloud
  }
}

// ── Download photo from Firestore into IndexedDB ────────

async function downloadPhotoFromCloud(uid, cardNumber) {
  try {
    const docSnap = await firebaseDB.collection('users').doc(uid)
      .collection('photos').doc(String(cardNumber)).get();

    if (!docSnap.exists) return;
    const data = docSnap.data();

    let photoBlob = null;
    let thumbnailBlob = null;

    if (data.photo) {
      photoBlob = await base64ToBlob(data.photo);
    }
    if (data.thumbnail) {
      thumbnailBlob = await base64ToBlob(data.thumbnail);
    }

    if (photoBlob || thumbnailBlob) {
      await savePhoto(cardNumber, photoBlob, thumbnailBlob);
      delete thumbCache[cardNumber];
    }
  } catch (e) {
    console.warn('Photo download failed for card', cardNumber, e);
  }
}

// ── Full merge on sign-in ───────────────────────────────
// Additive: uploads local cards missing from cloud,
// downloads cloud cards missing locally. Nothing is lost.

async function syncOnSignIn() {
  const user = getCurrentUser();
  if (!user) return;

  showSyncStatus('Syncing...');

  try {
    // Get cloud collection
    const cloudSnap = await firebaseDB.collection('users').doc(user.uid)
      .collection('collection').get();
    const cloudCards = {};
    cloudSnap.forEach((doc) => { cloudCards[doc.id] = doc.data(); });

    // Get local collection
    const localCards = await getAllCollected();
    const localMap = {};
    localCards.forEach((c) => { localMap[c.cardNumber] = c; });

    // Upload local cards that are not in cloud
    for (const card of localCards) {
      if (!cloudCards[card.cardNumber]) {
        await syncCardToCloud(card.cardNumber, 'collect');
        await syncPhotoToCloud(card.cardNumber);
      }
    }

    // Download cloud cards that are not local
    for (const [cardNumber, cloudData] of Object.entries(cloudCards)) {
      if (!localMap[cardNumber]) {
        await markCollected(cardNumber, cloudData.rarity || 'white');
        // Overwrite dateAdded to match cloud
        const tx = db.transaction('collection', 'readwrite');
        const store = tx.objectStore('collection');
        const rec = await new Promise((res) => {
          const r = store.get(cardNumber);
          r.onsuccess = () => res(r.result);
        });
        if (rec && cloudData.dateAdded) {
          rec.dateAdded = cloudData.dateAdded;
          store.put(rec);
        }
        await downloadPhotoFromCloud(user.uid, cardNumber);
      } else {
        // Both exist — last write wins based on updatedAt
        const localDate = localMap[cardNumber].dateAdded || '';
        const cloudDate = cloudData.updatedAt || cloudData.dateAdded || '';
        if (cloudDate > localDate && cloudData.rarity !== localMap[cardNumber].rarity) {
          await updateRarity(cardNumber, cloudData.rarity || 'white');
        }
        // Download photo if we don't have one locally (handles race condition
        // where card synced before the photo finished uploading)
        const localPhoto = await getPhoto(cardNumber);
        if (!localPhoto || (!localPhoto.photoBlob && !localPhoto.thumbnailBlob)) {
          await downloadPhotoFromCloud(user.uid, cardNumber);
        }
      }
    }

    // Refresh the in-memory cache and re-render if on dashboard
    await refreshCollectedSet();
    Object.keys(thumbCache).forEach(k => delete thumbCache[k]);
    const hash = window.location.hash.slice(1) || '/';
    if (hash === '/') renderDashboard();

    // Start listening for real-time changes from other devices
    startSyncListener();

    showSyncStatus('Synced!');
  } catch (e) {
    console.error('Sync failed:', e);
    showSyncStatus('Sync failed');
  }
}

// ── Real-time listener for changes from other devices ───

function startSyncListener() {
  const user = getCurrentUser();
  if (!user || _syncListener) return;

  _syncListener = firebaseDB.collection('users').doc(user.uid)
    .collection('collection')
    .onSnapshot((snapshot) => {
      if (_syncPaused) return;

      snapshot.docChanges().forEach(async (change) => {
        const cardNumber = change.doc.id;
        const data = change.doc.data();

        if (change.type === 'added' || change.type === 'modified') {
          if (!isCollected(cardNumber)) {
            await markCollected(cardNumber, data.rarity || 'white');
            await downloadPhotoFromCloud(user.uid, cardNumber);
            await refreshCollectedSet();
            delete thumbCache[cardNumber];
          } else if (data.rarity && data.rarity !== getRarity(cardNumber)) {
            await updateRarity(cardNumber, data.rarity);
            await refreshCollectedSet();
          }
        } else if (change.type === 'removed') {
          if (isCollected(cardNumber)) {
            await markUncollected(cardNumber);
            await refreshCollectedSet();
            delete thumbCache[cardNumber];
          }
        }
      });
    }, (err) => {
      console.warn('Sync listener error:', err);
    });
}

function stopSyncListener() {
  if (_syncListener) {
    _syncListener(); // Calling the unsubscribe function
    _syncListener = null;
  }
}

// ── Sync status toast ───────────────────────────────────

let _syncToastTimer = null;

function showSyncStatus(message) {
  let toast = document.getElementById('sync-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('visible');

  clearTimeout(_syncToastTimer);
  _syncToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}
