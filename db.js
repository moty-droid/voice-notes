const DB_NAME = 'VoiceNotesDB';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('summaries')) {
        const store = db.createObjectStore('summaries', { keyPath: 'date' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addNote(text) {
  const db = await openDB();
  const now = new Date();
  const note = {
    text,
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10)
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    const req = tx.objectStore('notes').add(note);
    req.onsuccess = () => resolve({ ...note, id: req.result });
    req.onerror = () => reject(req.error);
  });
}

async function getNotesByDate(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const idx = tx.objectStore('notes').index('date');
    const req = idx.getAll(dateStr);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getNotesByDateRange(startDate, endDate) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const idx = tx.objectStore('notes').index('date');
    const range = IDBKeyRange.bound(startDate, endDate);
    const req = idx.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const req = tx.objectStore('notes').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readwrite');
    const req = tx.objectStore('notes').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function saveSummary(dateStr, summaryText) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('summaries', 'readwrite');
    const req = tx.objectStore('summaries').put({ date: dateStr, text: summaryText, createdAt: new Date().toISOString() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getSummary(dateStr) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('summaries', 'readonly');
    const req = tx.objectStore('summaries').get(dateStr);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getSummariesByRange(startDate, endDate) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('summaries', 'readonly');
    const range = IDBKeyRange.bound(startDate, endDate);
    const req = tx.objectStore('summaries').getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export {
  addNote, getNotesByDate, getNotesByDateRange, getAllNotes, deleteNote,
  saveSummary, getSummary, getSummariesByRange
};
