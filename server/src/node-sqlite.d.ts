// Объявление `node:sqlite` — ровно той поверхности, которой пользуется служба.
//
// В проекте стоит @types/node версии 20, а встроенная SQLite появилась в Node 22.
// Поднимать типы Node на весь проект ради сервера — менять основание под всем
// приложением ради одного его угла; радиус поражения несопоставим с выгодой.
//
// Заодно этот файл честно показывает, на что служба опирается: три метода и
// один класс. Если однажды понадобится четвёртый, это придётся написать здесь —
// то есть заметить.

declare module "node:sqlite" {
  export type SQLValue = string | number | bigint | Uint8Array | null;

  export class StatementSync {
    get<T = Record<string, SQLValue>>(...params: SQLValue[]): T | undefined;
    all<T = Record<string, SQLValue>>(...params: SQLValue[]): T[];
    run(...params: SQLValue[]): { changes: number; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
