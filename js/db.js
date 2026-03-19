// IndexedDB wrapper — handles all local data persistence
// (IndexedDB is the browser's built-in database for storing data locally on the device)

const DB_NAME = 'soccer-cards-db';
const DB_VERSION = 1;
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;

      // Store for tracking which cards are collected
      if (!database.objectStoreNames.contains('collection')) {
        database.createObjectStore('collection', { keyPath: 'cardNumber' });
      }

      // Store for card photos (full size + thumbnails)
      if (!database.objectStoreNames.contains('photos')) {
        database.createObjectStore('photos', { keyPath: 'cardNumber' });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
  });
}

function markCollected(cardNumber) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collection', 'readwrite');
    tx.objectStore('collection').put({
      cardNumber,
      collected: true,
      dateAdded: new Date().toISOString()
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function markUncollected(cardNumber) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['collection', 'photos'], 'readwrite');
    tx.objectStore('collection').delete(cardNumber);
    tx.objectStore('photos').delete(cardNumber);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getCollectionStatus(cardNumber) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collection', 'readonly');
    const request = tx.objectStore('collection').get(cardNumber);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function getAllCollected() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('collection', 'readonly');
    const request = tx.objectStore('collection').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function savePhoto(cardNumber, photoBlob, thumbnailBlob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    tx.objectStore('photos').put({ cardNumber, photoBlob, thumbnailBlob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getPhoto(cardNumber) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const request = tx.objectStore('photos').get(cardNumber);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function getAllPhotos() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const request = tx.objectStore('photos').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Export all collection data as JSON (for backup)
async function exportData() {
  const collection = await getAllCollected();
  const photos = await getAllPhotos();

  // Convert blobs to base64 for JSON export
  const photosWithBase64 = await Promise.all(photos.map(async (p) => {
    return {
      cardNumber: p.cardNumber,
      photo: p.photoBlob ? await blobToBase64(p.photoBlob) : null,
      thumbnail: p.thumbnailBlob ? await blobToBase64(p.thumbnailBlob) : null
    };
  }));

  return JSON.stringify({ collection, photos: photosWithBase64 }, null, 2);
}

// Import collection data from JSON backup
async function importData(jsonString) {
  const data = JSON.parse(jsonString);

  // Clear existing data
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['collection', 'photos'], 'readwrite');
    tx.objectStore('collection').clear();
    tx.objectStore('photos').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Import collection status
  for (const item of data.collection) {
    await markCollected(item.cardNumber);
  }

  // Import photos
  if (data.photos) {
    for (const p of data.photos) {
      const photoBlob = p.photo ? await base64ToBlob(p.photo) : null;
      const thumbnailBlob = p.thumbnail ? await base64ToBlob(p.thumbnail) : null;
      if (photoBlob || thumbnailBlob) {
        await savePhoto(p.cardNumber, photoBlob, thumbnailBlob);
      }
    }
  }
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64) {
  return fetch(base64).then(r => r.blob());
}

// Estimate storage usage
async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return {
      used: est.usage || 0,
      quota: est.quota || 0
    };
  }
  return { used: 0, quota: 0 };
}
