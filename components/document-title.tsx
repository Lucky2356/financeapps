"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useI18n } from "@/lib/i18n/context";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Заголовок окна (вкладки) на языке экрана.
 *
 * Метаданные страниц (`export const metadata`) статические: их пишет сборка,
 * без окна, то есть по-русски, — и для поисковиков пусть так и остаются. А вот
 * человек, выбравший английский, видел в заголовке окна «Аналитика | Финансовый
 * помощник» над английским экраном. Поэтому заголовок переписывается здесь, из
 * словаря: «<экран> | <приложение>», на главной — одно название приложения.
 *
 * Название экрана — тот же ключ `page.<экран>.title`, что у PageHeader:
 * «/what-if» → `page.whatIf.title`. Нет такого ключа — только название.
 */
export function documentTitleFor(pathname: string, t: Translate): string {
  const app = t("shell.appName");
  const segment = pathname.split("/").find(Boolean);
  if (!segment) return app;
  const key = `page.${segment.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}.title`;
  const page = t(key);
  return page === key ? app : `${page} | ${app}`;
}

export function DocumentTitle() {
  const pathname = usePathname() ?? "/";
  const { t } = useI18n();
  const wanted = documentTitleFor(pathname, t);

  useEffect(() => {
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    // Next ставит <title> из метаданных и при переходе между экранами — уже
    // после нашего эффекта. Следим за <head> и возвращаем свой; сравнение в
    // apply не даёт этому зациклиться.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [wanted]);

  return null;
}
