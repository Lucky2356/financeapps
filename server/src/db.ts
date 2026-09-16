// База службы.
//
// SQLite через встроенный в Node модуль — и отсюда главное свойство всей
// службы: У НЕЁ НОЛЬ ЗАВИСИМОСТЕЙ. Ни одного npm-пакета, ни одной сборки на
// сервере, нечему устареть и неоткуда прийти чужому коду. Для машины, которую
// человек держит сам и в одиночку, это стоит дороже любого удобства: обновление
// службы — это `git pull` и `systemctl restart`, а не разбор того, почему
// сегодня не ставится очередной пакет.
//
// Что лежит в базе — и, что важнее, ЧЕГО В НЕЙ НЕТ. Содержимого книг здесь нет:
// они лежат зашифрованными, ключа от них у сервера нет и быть не может. Украв
// эту базу целиком, нельзя узнать ни одной суммы, ни одного названия счёта.
// Видно другое, и об этом надо сказать прямо: сколько у кого книг, какого они
// размера и когда их последний раз правили.

import { DatabaseSync } from "node:sqlite";

export type Person = {
  id: string;
  login: string;
  secret_hash: string;
  secret_salt: string;
  /** Шкатулка с завёрнутыми ключами книги — как её прислало устройство. */
  vault: string;
  created_at: string;
};

export type BookRow = {
  person_id: string;
  slot: string;
  version: number;
  body: string;
  updated_at: string;
};

const SCHEMA = `
  pragma journal_mode = wal;
  pragma foreign_keys = on;

  create table if not exists people (
    id          text primary key,
    -- Имя хранится приведённым к нижнему регистру средствами языка, а не
    -- collate nocase: та складывает только латиницу, и «ПЕТЯ» с «петя» остались
    -- бы для базы двумя разными людьми. Приведение делает normalizeLogin.
    login       text not null unique,
    secret_hash text not null,
    secret_salt text not null,
    vault       text not null,
    created_at  text not null
  );

  -- Ячейка на человека и профиль. Уже существующие в приложении профили каждый
  -- получает свою строку, и это почти бесплатно.
  create table if not exists books (
    person_id  text not null references people(id) on delete cascade,
    slot       text not null,
    version    integer not null,
    body       text not null,
    updated_at text not null,
    primary key (person_id, slot)
  );

  create table if not exists invitations (
    code      text primary key,
    issued_at text not null,
    used_by   text references people(id),
    used_at   text
  );

  -- Устройства нужны человеку, а не серверу: увидеть свой список и выкинуть
  -- потерянный телефон.
  create table if not exists devices (
    id           text primary key,
    person_id    text not null references people(id) on delete cascade,
    name         text not null,
    last_seen_at text not null
  );

  -- Хранится ХЕШ входного билета, а не он сам: украденная база не даёт войти.
  create table if not exists sessions (
    token_hash text primary key,
    person_id  text not null references people(id) on delete cascade,
    device_id  text references devices(id) on delete set null,
    created_at text not null,
    expires_at text not null
  );

  create index if not exists sessions_person on sessions(person_id);
  create index if not exists devices_person on devices(person_id);
`;

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** Убирает просроченные билеты. Зовётся при входе — чистки по часам не нужно. */
export function sweepSessions(db: DatabaseSync, now: string): void {
  db.prepare("delete from sessions where expires_at < ?").run(now);
}
