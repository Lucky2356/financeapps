// Прогон СОБРАННОГО приложения — того самого .exe, который уезжает человеку.
//
// Зачем это есть. Все прежние проверки живут в браузере: vitest — в jsdom,
// Playwright — в Chromium по статической оболочке. Ни та ни другая не видят
// собранного приложения, а между оболочкой и приложением лежат четыре вещи,
// которых нет больше нигде:
//
//   1. политика безопасности в том виде, как её применяет WebView2;
//   2. запрос к адресу, которого в этой политике нет, — через Rust;
//   3. обновлялка, читающая настоящий манифест;
//   4. файловый плагин и родные окна выбора файла.
//
// Первые три здесь проверяются. Четвёртое — нет, и врать об этом не будем:
// окно выбора файла рисует Windows, WebDriver до него не дотягивается, и
// закрывать этот шов пришлось бы средствами вроде AutoIt. Он остаётся в
// памятке выпуска как ручная проверка на пять минут.
//
// Почему разговор с WebDriver написан руками, а не взят готовый. Весь протокол
// здесь — это JSON по HTTP, десяток ручек, и на него ушло меньше кода, чем
// заняло бы описание настроек чужого запускателя. Ровно тем же соображением
// живёт служба: зависимость окупается работой, которую снимает, а здесь
// снимать нечего.
//
// Запуск (только Windows, приложение должно быть уже собрано):
//   node scripts/drive-desktop.mjs путь\к\financial-assistant.exe

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DRIVER = "http://127.0.0.1:4444";
const PASSWORD = "прогон-собранного-приложения";

/** Адрес, которого НЕТ в политике безопасности сборки. В этом весь смысл. */
const STRANGER = "https://example.com";

const BUILT = "src-tauri/target/release";

/**
 * Найти собранное приложение, а не назвать его по имени.
 *
 * Имя двоичного файла берётся из productName, а он у нас кириллический —
 * «Финансовый помощник.exe». Написать это имя в настройках действия значит
 * завязаться на то, что кириллица доедет через YAML, переменные окружения и
 * PowerShell в том же виде; в выпуске для установщика имя из-за этого и
 * приводят к латинице отдельным шагом. Проще посмотреть, что лежит в папке.
 */
function pickApp() {
  const named = process.argv[2];
  if (named) return named;
  if (!existsSync(BUILT)) return null;
  // deps, build, .fingerprint — служебные; нужен .exe, лежащий прямо здесь.
  const exe = readdirSync(BUILT).filter((name) => name.endsWith(".exe"));
  return exe.length === 0 ? null : join(BUILT, exe[0]);
}

const app = pickApp();

// ——— разговор с WebDriver ————————————————————————————————————————

let sessionId = null;

async function call(method, path, body) {
  // У команды POST тело обязательно, даже когда сказать нечего.
  //
  // Драйвер разбирает тело у всякой POST и на пустоту отвечает «invalid
  // argument: missing command parameters» — строкой про параметры, хотя дело в
  // отсутствии самого тела. Этим споткнулись и перечитывание страницы, и щелчок
  // по кнопке: обоим сказать нечего, и оба уходили без тела. Пустой предмет
  // здесь — не украшение, а то, чего ждёт протокол.
  const sends = method === "POST";
  const outgoing = sends ? (body ?? {}) : body;
  const response = await fetch(`${DRIVER}${path}`, {
    method,
    headers: outgoing === undefined ? {} : { "content-type": "application/json" },
    body: outgoing === undefined ? undefined : JSON.stringify(outgoing)
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`WebDriver ответил не JSON (${response.status}): ${text.slice(0, 200)}`);
  }
  if (payload.value?.error) {
    throw new Error(`${payload.value.error}: ${payload.value.message ?? ""}`.trim());
  }
  return payload.value;
}

const inSession = (method, path, body) => call(method, `/session/${sessionId}${path}`, body);

/** Выполнить в странице и вернуть результат. */
const run = (script, args = []) => inSession("POST", "/execute/sync", { script, args });

/**
 * Найти по CSS — через «elements», а не «element», намеренно.
 *
 * Одиночная ручка на отсутствие отвечает ошибкой протокола, и разбор падения
 * начинается с чтения чужого стека. Список отвечает пустотой, и сказать «не
 * нашёл такого-то» можно своими словами.
 */
async function find(css) {
  const found = await inSession("POST", "/elements", { using: "css selector", value: css });
  return found.length > 0 ? Object.values(found[0])[0] : null;
}

const click = (id) => inSession("POST", `/element/${id}/click`);
const type = (id, text) => inSession("POST", `/element/${id}/value`, { text });

/** Текст всей страницы — по нему и сверяемся: человек видит его же. */
const seen = () => run("return document.body.innerText");

async function until(what, check, ms = 60_000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const answer = await check();
    if (answer) return answer;
    if (Date.now() > deadline) throw new Error(`не дождались: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

const waitFor = (css) => until(`элемент ${css}`, () => find(css));
const waitText = (needle) =>
  until(`текст «${needle}»`, async () => (await seen()).includes(needle));

/**
 * Нажать кнопку или ссылку с такой подписью.
 *
 * Поиск идёт в самой странице одним заходом, а не перебором элементов по
 * протоколу: на экране настроек кнопок и ссылок за сотню, и спрашивать текст у
 * каждой значило бы сотню запросов на каждую попытку. Узел, возвращённый из
 * скрипта, WebDriver сам отдаёт ссылкой на элемент — по ней и щёлкаем.
 */
async function press(label) {
  const found = await until(`кнопка «${label}»`, () =>
    run(
      // Сверяется ПЕРВАЯ СТРОКА подписи, а не вся целиком.
      //
      // На выборе источника данных подпись и пояснение лежат в одной кнопке:
      // «Начать с нуля\nПустые счета и операции — их заполняете вы». Точное
      // равенство не совпадало с ней ни по-русски, ни по-английски, и выглядело
      // это как «кнопки нет». Первая строка — это ровно то, что человек читает
      // как название кнопки.
      "return Array.from(document.querySelectorAll('button, a')).find((node) => {" +
        " const text = node.innerText.trim();" +
        " return text === arguments[0] || text.split('\\n')[0].trim() === arguments[0];" +
        "}) ?? null",
      [label]
    )
  );
  await click(Object.values(found)[0]);
}

/**
 * Закрыть окно, если приложение открыло его само.
 *
 * Про резервную копию, про код восстановления — приложение показывает их без
 * спроса, и живой человек их закрывает. Оснастка, которая этого не делает,
 * упирается в затемнение поверх экрана, и выглядит это как «кнопка не
 * нажимается» — на живом прогоне двух устройств мы на это уже наступали.
 *
 * Событие посылается в document, а не клавишей: окна слушают именно его, а
 * набирать клавиатурой через протокол вышло бы втрое длиннее ради того же.
 */
async function closeDialogs() {
  for (let tries = 0; tries < 3; tries += 1) {
    const open = await run("return document.querySelectorAll('[role=\"dialog\"]').length");
    if (!open) return;
    await run(
      "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

// ——— сами швы ————————————————————————————————————————————————————

/**
 * Ш-1. Приложение живёт под настоящей политикой безопасности.
 *
 * Проверяется не «нарисовалось что-то», а прохождение первого запуска целиком:
 * пароль, код восстановления, две проверочные строки. За это отвечают разом
 * скрипты страницы, WebCrypto с шестьюстами тысячами прогонов PBKDF2 и запись
 * в IndexedDB. Погасни любое из трёх — дальше первого шага не уйти.
 */
async function firstRun() {
  // Первый запуск начинается с выбора, откуда взять данные, и следом — нужен ли
  // пароль. Швы проверяются по ветке «с нуля, с паролем»: она проходит через
  // WebCrypto и запись в IndexedDB целиком, то есть через всё, что политика
  // WebView2 может погасить.
  await press("Начать с нуля");
  await press("Задать пароль");

  await type(await waitFor("#vault-password"), PASSWORD);
  await type(await find("#vault-repeat"), PASSWORD);
  await press("Задать пароль");

  await waitText("Запишите код восстановления");

  // Слова с экрана — их же потом спросят обратно, по номерам.
  const words = await run(
    "return Array.from(document.querySelectorAll('ol li span.font-medium')).map(n => n.innerText.trim())"
  );
  if (words.length < 12) throw new Error(`слов на экране ${words.length}, ожидалось хотя бы 12`);

  await press("Я записал");
  await waitText("Проверим, что записали");

  for (const slot of [0, 1]) {
    const label = await run(
      'return document.querySelector(`label[for="vault-word-${arguments[0]}"]`).innerText',
      [slot]
    );
    const number = Number(String(label).replace(/\D+/g, ""));
    await type(await find(`#vault-word-${slot}`), words[number - 1]);
  }
  await press("Готово");

  await waitText("Загрузить пример");
  return "первый запуск пройден целиком: пароль, код восстановления, проверка слов";
}

/**
 * Ш-2. Запрос к адресу, которого нет в политике, всё-таки уходит наружу.
 *
 * Это главный шов и единственная проверка, ради которой стоило всё затевать.
 * Список разрешённых адресов зашит в сборку, а адрес своей службы человек
 * называет во время работы — совпасть они не могут никогда. Поэтому запрос
 * идёт не вкладкой, а Rust-ом, и работает это только в собранном приложении:
 * ни vitest, ни Playwright сюда не дотягиваются, там политики нет вовсе.
 *
 * Сверяемся по тому, КАКОЙ пришёл отказ, и разница между двумя тут решает всё:
 *
 *   «Не удалось связаться со службой…»  — запрос не ушёл. Шов порван.
 *   «По адресу … отвечает не служба…»   — запрос ушёл, дошёл, вернулся.
 *
 * Второе и есть успех: по тому адресу службы и правда нет, зато видно, что
 * приложение до неё добралось бы.
 */
async function strangerAddress() {
  await closeDialogs();
  await press("Настройки");
  await closeDialogs();
  await type(await waitFor("#server-base"), STRANGER);
  await type(await find("#server-login"), "прогон");
  await type(await find("#server-password"), PASSWORD);
  await press("Подключить устройство");

  const message = await until("ответ на попытку подключения", async () => {
    const text = await seen();
    if (text.includes("отвечает не служба")) return "дошёл";
    if (text.includes("Не удалось связаться со службой")) return "не ушёл";
    return null;
  });

  if (message === "не ушёл") {
    throw new Error(
      `запрос к ${STRANGER} не вышел из приложения — политика безопасности гасит его, ` +
        "и своя служба человеку недоступна"
    );
  }
  return `запрос к ${STRANGER} ушёл через Rust и вернулся ответом`;
}

/**
 * Ш-3. Обновлялка спрашивает настоящий манифест и получает ответ.
 *
 * Проверяется не «есть обновление» — его может и не быть, — а то, что вопрос
 * задан и ответ получен: ключ на месте, адрес разрешён, подпись читается.
 *
 * Ответов у обновлялки ровно три, и сверяться надо с ними целиком, а не с
 * обрывками слов. Первая эта проверка искала в тексте всей страницы кусок
 * «последн» — и нашла его в кнопке «Отменить последний импорт», которая лежала
 * на экране настроек ещё до нажатия. Шов показал зелёное, не спросив обновлялку
 * ни разу, и показывал бы его всегда.
 *
 * Такое хуже красного: красное зовёт разбираться, а ложное зелёное выдаёт себя
 * за доказательство. Поэтому здесь перечислены три настоящих ответа, и третий
 * из них — поломка, ради которой шов и заведён.
 */
const UPDATER_FINE = ["У вас актуальная версия", "Доступно обновление"];
const UPDATER_BROKEN = "Автообновление недоступно";

async function updates() {
  await press("Проверить обновления");
  const answer = await until(
    "ответ обновлялки",
    async () => {
      const text = await seen();
      if (text.includes(UPDATER_BROKEN)) return { fine: false, line: UPDATER_BROKEN };
      const said = UPDATER_FINE.find((known) => text.includes(known));
      if (!said) return null;
      const line = text.split("\n").find((part) => part.includes(said)) ?? said;
      return { fine: true, line: line.trim().slice(0, 120) };
    },
    90_000
  );

  if (!answer.fine) {
    throw new Error(
      "обновлялка не смогла прочитать манифест — это и есть тот шов, ради которого " +
        "прогон заведён: ключ, адрес выпусков или подпись не сошлись, и человек " +
        "обновление не получит"
    );
  }
  return `обновлялка ответила: ${answer.line}`;
}

// ——— прогон ——————————————————————————————————————————————————————

const SEAMS = [
  ["Ш-1 приложение живёт под настоящей политикой безопасности", firstRun],
  ["Ш-2 запрос к чужому адресу уходит наружу", strangerAddress],
  ["Ш-3 обновлялка читает настоящий манифест", updates]
];

async function main() {
  if (!app || !existsSync(app)) {
    console.error(`Собранного приложения не нашлось: ${app ?? BUILT}`);
    process.exit(1);
  }

  // Слово драйвера попадает в журнал: без него неудача выглядит одной строкой
  // про несуществующий файл, и разбирать нечего.
  const driver = spawn("tauri-driver", ["--port", "4444"], { stdio: "inherit" });
  console.log(`Приложение для прогона: ${app}`);
  driver.on("error", (cause) => {
    console.error("tauri-driver не запустился:", cause.message);
    process.exit(1);
  });

  let failed = 0;
  try {
    await until(
      "готовность tauri-driver",
      async () => {
        try {
          await fetch(`${DRIVER}/status`);
          return true;
        } catch {
          return false;
        }
      },
      30_000
    );

    // Здесь приложение открывается — и здесь же прогон спотыкается на машине
    // сборки. Причина не наша, и записана она, чтобы следующий читатель не
    // потратил на неё три прогона, как я.
    //
    // WebView2 Runtime 150 (июль 2026) перестал принимать порт отладки от
    // приложения, запущенного С ПРАВАМИ АДМИНИСТРАТОРА: ни из командной
    // строки, ни из переменных окружения, ни из HKCU. Драйвер Edge выставляет
    // порт ровно переменной окружения — и она молча отбрасывается. Файла с
    // портом не появляется, и приходит «DevToolsActivePort file doesn't
    // exist»: строка про несуществующий файл вместо строки про отнятое право.
    //
    // Отсюда windows-2022 в настройках действия: там WebView2 ещё 131.
    //
    // browserName здесь не указан НАРОЧНО. На Windows tauri-driver ставит его
    // сам — «webview2», перезаписывая что бы мы ни прислали (map_capabilities,
    // always_match.extend). Строка «wry» из руководства — про Linux и WebKit;
    // на Windows она не значит ничего, и одна попытка починки ушла на неё.
    const created = await call("POST", "/session", {
      capabilities: {
        alwaysMatch: { "tauri:options": { application: app } }
      }
    });
    sessionId = created.sessionId;
    console.log(`Приложение открыто: ${app}`);

    // Что на экране НА САМОМ ДЕЛЕ.
    //
    // Без этого неудача шва звучит одинаково при трёх разных положениях дел:
    // страница не загрузилась вовсе; загрузилась, но драйвер смотрит в чужое
    // окно; загрузилась наша и показывает не то, чего мы ждём. Разбирать их по
    // строке «не дождались кнопки» — то же гадание, что стоило трёх прогонов
    // на «DevToolsActivePort».
    const snapshot = async () => {
      const windows = await inSession("GET", "/window/handles").catch(() => []);
      const where = await run("return location.href").catch(() => "?");
      const title = await run("return document.title").catch(() => "?");
      const text = await run(
        "return document.body ? document.body.innerText.slice(0, 400) : '<body ещё нет>'"
      ).catch((cause) => `<не прочиталось: ${cause.message}>`);
      const buttons = await run(
        "return Array.from(document.querySelectorAll('button')).map(n => n.innerText.trim()).filter(Boolean).slice(0, 12)"
      ).catch(() => []);
      return [
        `окон: ${windows.length}; адрес: ${where}; заголовок: ${title}`,
        `видно: ${JSON.stringify(text)}`,
        `кнопки: ${JSON.stringify(buttons)}`
      ].join("\n  ");
    };

    // Оболочка рисуется не мгновенно: статическая страница ещё поднимает Next,
    // ворота ещё спрашивают хранилище. Ждём первых слов, а не первого шва.
    try {
      await until(
        "первые слова на экране",
        async () => {
          const text = await run(
            "return document.body ? document.body.innerText.trim() : ''"
          ).catch(() => "");
          return text.length > 0;
        },
        60_000
      );
    } catch {
      console.log("Экран так и остался пустым.");
    }

    // Язык закрепляется НАРОЧНО, и это не подгонка под оснастку.
    //
    // Приложение выбирает язык так: сохранённый выбор, иначе язык устройства,
    // иначе русский. На машине сборки Windows английская — и приложение
    // открылось по-английски, «Where do we start?» вместо «С чего начнём?».
    // Оснастка искала русские подписи и не нашла ни одной.
    //
    // То есть исход прогона зависел от языка чужой машины. Это надо убирать, а
    // не обходить: не закрепи мы язык, проверка отвечала бы по-разному на
    // одинаковом приложении, и однажды её ответ ничего бы не значил.
    //
    // Пишется тот же ключ, что и настройками приложения, и страница
    // перечитывается — ровно то, что делает человек, выбрав язык.
    const already = await run("return document.documentElement.lang");
    if (already !== "ru") {
      await run("try { localStorage.setItem('app-locale', 'ru'); } catch {}");
      await inSession("POST", "/refresh");
      await until(
        "русский на экране",
        async () => (await run("return document.documentElement.lang").catch(() => "")) === "ru",
        30_000
      );
      console.log(`Язык закреплён: был «${already}», стал «ru».`);
    }

    console.log(`  ${await snapshot()}`);

    for (const [name, seam] of SEAMS) {
      try {
        console.log(`✓ ${name}\n  ${await seam()}`);
      } catch (cause) {
        failed += 1;
        console.log(`✗ ${name}\n  ${cause.message}\n  ${await snapshot()}`);
        // Дальше идём: швы независимы, и знать про все разом полезнее, чем
        // чинить их по одному прогону за двадцать минут.
      }
    }
  } catch (cause) {
    failed += 1;
    console.error(`Прогон не состоялся: ${cause.message}`);
  } finally {
    if (sessionId) await call("DELETE", `/session/${sessionId}`).catch(() => {});
    driver.kill();
  }

  console.log(failed === 0 ? "\nВсе швы целы." : `\nШвов с поломкой: ${failed}.`);
  process.exit(failed === 0 ? 0 : 1);
}

await main();
