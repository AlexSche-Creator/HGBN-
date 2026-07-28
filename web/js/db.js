// Хранилище файлов (PDF/JPEG анамнезов и заключений) в IndexedDB.
// Метаданные документов лежат в localStorage-store, а сами блобы — здесь,
// чтобы не раздувать localStorage. Всё на устройстве.

const DB_NAME = 'hgbn-files';
const STORE = 'docs';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB недоступен')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const res = fn(store);
    t.oncomplete = () => resolve(res && res.result !== undefined ? res.result : res);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export function putDoc(id, blob) {
  return tx('readwrite', (store) => store.put(blob, id));
}
export function getDoc(id) {
  return tx('readonly', (store) => store.get(id));
}
export function deleteDoc(id) {
  return tx('readwrite', (store) => store.delete(id));
}

// Блоб → чистый base64 (без префикса data:) для отправки в Claude API.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
