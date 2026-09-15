export interface StorageAdapter {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  /**
   * Всё, что сейчас лежит в хранилище.
   *
   * Нужен там, где надо пройти по хранилищу целиком и ничего не пропустить, —
   * прежде всего при переводе книги в зашифрованный вид. Список «известных
   * ключей» для этого не годится: забытый в нём ключ остался бы лежать открытым
   * навсегда, и заметить это было бы нечем.
   */
  keys(): Promise<string[]>;
}
