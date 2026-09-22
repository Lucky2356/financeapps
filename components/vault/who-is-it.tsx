"use client";

// «Кто за компьютером» — экран перед замком, когда людей на устройстве больше
// одного.
//
// ПОЧЕМУ ТОЛЬКО БОЛЬШЕ ОДНОГО. Человеку, который на устройстве один, этот экран
// не говорит ничего — он лишь добавляет нажатие к каждому запуску. А укоротить
// путь до первой операции было смыслом всего предыдущего выпуска; удлинять его
// здесь же было бы смешно.
//
// ПОЧЕМУ НА НЁМ НАПИСАНО ПРО СОСЕДА. Разделение честно ровно настолько,
// насколько заперты данные. У человека без пароля и у поставившего «не
// спрашивать на этом устройстве» ключ лежит в хранилище открытым — по замыслу,
// иначе «не спрашивать» не работало бы вовсе. Сосед возьмёт компьютер и
// откроет.
//
// Экран, обещающий «друг друга вы не видите» и умалчивающий об этом, обещает
// защиту, которой нет. Человек, поверивший такому обещанию, ведёт в приложении
// то, что иначе прятал бы, — и узнаёт правду в худший из возможных дней.
// Поэтому подпись стоит на самой плитке, у того, к кому относится, а не мелким
// шрифтом внизу.

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { Shell } from "@/components/vault/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { addPersonAndSwitch, switchPerson, type PersonCard } from "@/lib/vault/runtime";

export function WhoIsIt({ people }: { people: PersonCard[] }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (adding) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">{t("vault.who.newTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("vault.who.newLead")}</p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            void addPersonAndSwitch(name).catch(() => setBusy(false));
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="person-name">{t("vault.who.newTitle")}</Label>
            <Input
              id="person-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("vault.who.namePlaceholder")}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={busy}>
              {t("vault.who.create")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setName("");
                setAdding(false);
              }}
              disabled={busy}
            >
              {t("vault.who.back")}
            </Button>
          </div>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold">{t("vault.who.title")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("vault.who.lead")}</p>

      <div className="mt-5 space-y-2">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => void switchPerson(person.id)}
            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:border-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block text-sm font-medium">{person.name}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {person.unprotected ? t("vault.who.noPassword") : t("vault.who.locked")}
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            // Поле пустое при каждом открытии: имя предыдущей попытки в нём —
            // это чужое имя, подставленное молча.
            setName("");
            setAdding(true);
          }}
          className="flex w-full items-start gap-3 rounded-lg border border-dashed bg-card p-4 text-left transition-colors hover:border-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="block text-sm font-medium">{t("vault.who.add")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("vault.who.addHint")}
            </span>
          </span>
        </button>
      </div>
    </Shell>
  );
}
