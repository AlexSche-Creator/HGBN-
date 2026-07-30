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

// Подготовка фото к отправке: уменьшаем и перекодируем в JPEG.
// Зачем: снимок с iPhone — это 20+ Мп и 5+ МБ (в base64 ещё +33%), из-за чего
// запрос идёт десятки секунд на мобильной сети и стоит лишних токенов.
// Плюс камера iPhone часто отдаёт HEIC, который API не принимает, —
// перерисовка через canvas решает и это.
export async function imageToJpegBase64(file, maxEdge = 1600, quality = 0.85) {
  const fallback = async () => ({
    base64: await blobToBase64(file),
    mediaType: file.type || 'image/jpeg',
    resized: false,
  });
  try {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      // Старый браузер — пробуем через <img> и обычный canvas.
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i); i.onerror = rej; i.src = url;
        });
        const { w, h } = fit(img.naturalWidth, img.naturalHeight, maxEdge);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', quality);
        return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', resized: true };
      } finally { URL.revokeObjectURL(url); }
    }
    const bmp = await createImageBitmap(file);
    const { w, h } = fit(bmp.width, bmp.height, maxEdge);
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { base64: await blobToBase64(blob), mediaType: 'image/jpeg', resized: true };
  } catch {
    return fallback();
  }
}

function fit(w, h, maxEdge) {
  const k = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
