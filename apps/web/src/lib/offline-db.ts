/**
 * Almacenamiento local del celular para la asistencia sin conexión (spec 05, RF-26 y RF-27): una
 * base IndexedDB mínima de clave y valor. Hay una base por persona (`evolugk-attendance-<id>`): las
 * marcas pendientes de una cuenta nunca se mezclan ni se envían con la sesión de otra.
 * Solo para componentes de cliente.
 */

const PREFIX = "evolugk-attendance-";
const STORE = "kv";

export const dbNameFor = (userId: string) => `${PREFIX}${userId}`;

export function openLocalDb(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbNameFor(userId), 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const kvGet = <T>(db: IDBDatabase, key: string): Promise<T | undefined> =>
  run(db, "readonly", (store) => store.get(key) as IDBRequest<T | undefined>);

export const kvSet = (db: IDBDatabase, key: string, value: unknown): Promise<unknown> =>
  run(db, "readwrite", (store) => store.put(value, key));

export const kvDelete = (db: IDBDatabase, key: string): Promise<undefined> =>
  run(db, "readwrite", (store) => store.delete(key));

/** Todos los valores cuyas claves empiezan con `prefix`. */
export function kvAllWithPrefix<T>(db: IDBDatabase, prefix: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const values: T[] = [];
    const request = transaction
      .objectStore(STORE)
      .openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        values.push(cursor.value as T);
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Borra las bases locales de otras cuentas que ya no tienen nada pendiente de sincronizar: así el
 * celular no guarda indefinidamente los datos de alguien que ya no lo usa. Las que sí tienen marcas
 * pendientes se conservan para no perderlas. Mejor esfuerzo: no todos los navegadores listan bases.
 */
export async function cleanOtherAccounts(
  currentUserId: string,
  hasPendingMarks: (db: IDBDatabase) => Promise<boolean>,
): Promise<void> {
  if (typeof indexedDB.databases !== "function") return;
  const databases = await indexedDB.databases();
  for (const info of databases) {
    const name = info.name;
    if (!name?.startsWith(PREFIX) || name === dbNameFor(currentUserId)) continue;
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const pending = await hasPendingMarks(db);
      db.close();
      if (!pending) indexedDB.deleteDatabase(name);
    } catch {
      // Si no se puede inspeccionar, se deja como está.
    }
  }
}
