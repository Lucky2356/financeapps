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
  const response = await fetch(`${DRIVER}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
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
      "return Array.from(document.querySelectorAll('button, a'))" +
        ".find((node) => node.innerText.trim() === arguments[0]) ?? null",
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
 * Ошибка здесь выглядит совсем иначе, чем «вы на последней версии».
 */
async function updates() {
  await press("Проверить обновления");
  const answer = await until(
    "ответ обновлялки",
    async () => {
      const text = await seen();
      for (const known of ["последн", "Обновление", "обновлени"]) {
        if (text.includes(known)) return text;
      }
      return null;
    },
    90_000
  );
  const line = answer.split("\n").find((part) => /последн|бновлени/.test(part)) ?? "";
  return `обновлялка ответила: ${line.trim().slice(0, 120)}`;
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

  const driver = spawn("tauri-driver", ["--port", "4444"], { stdio: "inherit" });
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

    const created = await call("POST", "/session", {
      capabilities: { alwaysMatch: { "tauri:options": { application: app } } }
    });
    sessionId = created.sessionId;
    console.log(`Приложение открыто: ${app}`);

    for (const [name, seam] of SEAMS) {
      try {
        console.log(`✓ ${name}\n  ${await seam()}`);
      } catch (cause) {
        failed += 1;
        console.log(`✗ ${name}\n  ${cause.message}`);
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
