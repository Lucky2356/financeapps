"use client";

// «Люди на этом устройстве» — единственная дверь к тому, чтобы завести второго.
//
// ПОЧЕМУ ЭКРАН ОБЯЗАН БЫТЬ ЗДЕСЬ. Возможность «двое на одном устройстве»
// выпущена, а войти в неё было неоткуда: завести человека умеет экран «Кто за
// компьютером?», а тот показывается, только когда людей УЖЕ больше одного. У
// того, кто на устройстве один — то есть у каждого в первый день, — двери не
// было вовсе. Курица и яйцо: чтобы завести второго, нужен второй.
//
// Показывается ВСЕГДА, даже одному. Это прямо противоположно правилу экрана
// выбора, и разница по существу: тот встаёт на пути к данным при каждом
// запуске, а этот лежит в настройках, куда заходят нарочно. Спрятать его от
// одинокого человека значило бы спрятать саму возможность от всех, кто ещё не
// успел ею воспользоваться.
//
// ЧЕГО ЗДЕСЬ НЕТ — УДАЛЕНИЯ ЧЕЛОВЕКА. Не потому, что забыли: стереть человека
// значит стереть и его мелочи из localStorage, а там нет приставки у настроек
// вида — они общие нарочно. Удаление по явному списку ключей это отдельная
// работа, и сделать её наполовину хуже, чем не начинать: «удалил», после
// которого чужие названия категорий остались лежать, — это обещание, которого
// приложение не сдержало.

import { UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import {
  addPersonAndSwitch,
  currentPersonId,
  listPeople,
  renamePersonHere,
  switchPerson,
  type PersonCard
} from "@/lib/vault/runtime";

export function PeoplePanel() {
  const { t } = useI18n();
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setPeople(await listPeople());
    setMe(await currentPersonId());
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const here = await listPeople();
        const mine = await currentPersonId();
        if (!alive) return;
        setPeople(here);
        setMe(mine);
      } catch {
        if (alive) setPeople([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function work(job: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await job();
      if (done) toast.success(done);
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="set-people" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" />
          {t("people.title")}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("people.lead")}</p>

        {people === null ? (
          <p className="text-sm text-muted-foreground">{t("people.loading")}</p>
        ) : (
          <ul className="space-y-2">
            {people.map((person) => (
              <li key={person.id} className="rounded-lg border bg-card p-3">
                {renaming === person.id ? (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void work(async () => {
                        await renamePersonHere(person.id, draft);
                        setRenaming(null);
                        await refresh();
                      }, t("people.renamed"));
                    }}
                  >
                    <Label htmlFor={`person-${person.id || "first"}`}>{t("people.name")}</Label>
                    <Input
                      id={`person-${person.id || "first"}`}
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={busy}>
                        {t("people.save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRenaming(null)}
                        disabled={busy}
                      >
                        {t("people.cancel")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {person.name}
                        {person.id === me ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            {t("people.you")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {person.unprotected ? t("people.noPassword") : t("people.locked")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setDraft(person.name);
                          setRenaming(person.id);
                        }}
                      >
                        {t("people.rename")}
                      </Button>
                      {person.id === me ? null : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void work(() => switchPerson(person.id))}
                        >
                          {t("people.open")}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {adding ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void work(() => addPersonAndSwitch(name));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="new-person">{t("people.newName")}</Label>
              <Input
                id="new-person"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("people.namePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("people.newHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {t("people.create")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  // Поле пустое при каждом открытии: имя предыдущей попытки —
                  // это чужое имя, подставленное молча тому, кто заводит себя.
                  setName("");
                  setAdding(false);
                }}
              >
                {t("people.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t pt-4">
            <Button
              type="button"
              disabled={busy}
              className="h-auto w-full whitespace-normal py-2 sm:w-auto"
              onClick={() => {
                setName("");
                setAdding(true);
              }}
            >
              <UserPlus className="size-4" />
              {t("people.add")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
