# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Добавлено
- **ИИ-помощники (4 новых, опционально при включённом ИИ-ассистенте).**
  - *Автокатегоризация пачкой* — на странице «Операции» выделите операции и нажмите «Разобрать ИИ»:
    модель проставит подходящие категории (только уверенные и подходящие по типу).
  - *ИИ-разбор финансов* — на «Аналитике» кнопка делает связный разбор: что хорошо, на что обратить
    внимание и что сделать в первую очередь.
  - *ИИ-планировщик бюджетов* — на «Бюджетах» предлагает месячные лимиты по категориям из средних
    трат; можно применить одним нажатием.
  - *ИИ-план накоплений по цели* — в карточке цели строит реалистичный план взносов и советует, где
    найти деньги. Все функции privacy-aware (уходят только агрегаты), ключи на вебе не сохраняются.
- **Правила категоризации устойчивы к «кривому» вводу.** Правило срабатывает независимо от
  регистра, ё/е, лишних пробелов, точек и запятых, цифр и масок карт (напр. «Пятёрочка» ловит
  «ПЯТЕРОЧКА №1234»). В одном правиле можно перечислить несколько ключей через запятую
  («мтс, мобильная связь»). Та же устойчивость — у подсказок по истории.

### Исправлено
- **Выбор акцента.** Выбранный цвет теперь однозначно отмечен галочкой и нейтральной обводкой
  (раньше кольцо красилось в сам акцент и на выбранном свотче было незаметно).
- **Единство акцента.** Декоративные акценты на «Аналитике» (норма сбережений, лучший месяц)
  теперь следуют за выбранным цветом. Доход/расход и цвета категорий остаются семантическими.

### Изменено
- **Компактные фильтры операций.** Панель фильтров свёрнута по умолчанию и разворачивается по
  кнопке; в свёрнутом виде показывается счётчик активных фильтров. Экран стал заметно компактнее.

## [1.2.0] — 2026-07-12

🎨 Дизайн-обновление: акцентные цвета, спарклайны и радиальный индикатор здоровья, ровные
цифры и графики под тему, плавные анимации, богаче пустые состояния и обновлённый экран входа.

### Добавлено
- **Выбор акцентного цвета.** В настройках → «Внешний вид» можно выбрать акцент интерфейса
  (изумрудный, синий, фиолетовый, янтарный) — он перекрашивает кнопки, ссылки и графики.
  Выбор сохраняется на устройстве и применяется без вспышки при загрузке.
- **Спарклайны в метриках.** Карточки «Доходы/Расходы за месяц» показывают мини-график
  тренда за последние месяцы (если история достаточна).
- **Индикатор финансового здоровья.** На дашборде вместо линейной полосы — радиальный
  индикатор с баллом в центре и цветом по уровню.
- **Плавные появления и анимация чисел.** Ключевые суммы «подкручиваются» при загрузке,
  секции мягко появляются. Всё уважает системную настройку «уменьшить движение».

### Изменено
- **Ровные цифры.** Денежные суммы теперь выводятся моноширинными цифрами (tabular-nums) —
  значения в таблицах и карточках-метриках больше не «прыгают» при смене разрядов.
- **Чёткость текста.** Подтянут контраст второстепенного текста под стандарт доступности (AA);
  иконки метрик используют насыщенный акцентный цвет вместо приглушённого.
- **Графики под тему.** Цвета линий, столбцов, осей и сетки берутся из темы и следуют за
  выбранным акцентом; всплывающая подсказка графика больше не белый блок в тёмной теме.
- **Полировка интерфейса.** Богаче пустые состояния, аккуратнее таблицы (чередование строк,
  единый стиль заголовков, плотность строк), единые состояния фокуса у полей, размытие фона
  у диалогов и обновлённый экран входа.

✨ Крупное обновление: массовые операции и расширенные фильтры, теги и дробление операций,
автообнаружение подписок, тренды и аномалии, отчёт за период с экспортом, финансовый
календарь, автобэкапы, учёт дивидендов и ребалансировка, настройка дашборда и автопополнение целей.

### Добавлено
- **Теги операций.** К операции можно добавить произвольные метки (через запятую) поверх
  категории; по тегу можно фильтровать список операций, а поиск учитывает теги.
- **Дробление операции.** Кнопка «Разбить» на странице «Операции» разносит один платёж
  по нескольким категориям — каждая строка становится отдельной операцией (учитывается
  в бюджетах и аналитике без задвоения). Разбитые операции помечены значком.
- **Настройка дашборда.** На главной появилась кнопка «Настроить»: можно скрывать,
  показывать и менять порядок блоков (обзор, прогноз, подушка, капитал, метрики, графики).
  Раскладка запоминается на устройстве.
- **Привязка цели к счёту и плановый взнос.** В форме цели можно указать счёт пополнения
  и запланированный ежемесячный взнос — он отображается в карточке цели рядом с расчётным темпом.
- **Автобэкапы (десктоп).** В настройках → «Данные» можно включить регулярное локальное
  резервное копирование: по расписанию (ежедневно/еженедельно) приложение сохраняет снимок
  данных в выбранную папку и удаляет самые старые копии (ротация).
- **Учёт и календарь дивидендов (десктоп).** На вкладке «Инвестиции → Аналитика» появился
  блок дивидендов: годовой доход по журналу выплат и список ближайших ожидаемых начислений,
  которые также отображаются в финансовом календаре.
- **Подсказки по ребалансировке (десктоп).** Задайте целевую долю по секторам — приложение
  покажет текущее распределение и сколько докупить или продать, чтобы прийти к цели.
- **Автообнаружение подписок.** На странице «Подписки» приложение находит регулярные
  списания прямо в истории операций (по мерчанту и стабильной сумме) и предлагает
  добавить их в плановые платежи одним кликом.
- **Тренды по категориям и аномалии.** На «Аналитике» появился блок со спарклайнами
  по категориям и предупреждениями вида «в этом месяце на X% больше обычного».
- **Отчёт за произвольный период с экспортом.** На странице «Отчёты» можно выбрать
  любой диапазон дат, сравнить год к году и выгрузить помесячный отчёт в CSV.
- **Финансовый календарь.** Календарь на «Прогнозе» теперь показывает не только
  плановые платежи, но и дедлайны целей, сброс бюджетов и (когда заведены) дивиденды.
- **Массовые операции над транзакциями.** На странице «Операции» появились чекбоксы:
  выберите несколько операций и пакетно смените категорию, примените правила
  авто-категоризации или удалите их разом (с подтверждением).
- **Расширенные фильтры операций.** К фильтрам добавлены диапазон суммы («от/до») и
  выбор сразу нескольких категорий. Частые наборы фильтров можно сохранить под именем
  и применять одним кликом («Сохранённые фильтры»).

### Улучшено
- **Доперевод интерфейса на английский.** Подсказки по подбору бумаг (диверсификация,
  риск, динамика) и предупреждения импорта CSV теперь показываются на языке приложения.

## [1.0.19] — 2026-07-05

🐛 Исправлена прозрачность выпадающих списков.

### Исправлено
- **Выпадающие списки (выбор валюты, типа операции, провайдера ИИ и т.д.) больше не
  прозрачные.** Из-за пропущенного сопоставления цвета `popover` в конфигурации Tailwind
  фон всплывающих списков не отрисовывался, и сквозь него просвечивал текст страницы —
  выбрать пункт было трудно. Теперь фон непрозрачный во всех меню, списках и поповерах.

## [1.0.18] — 2026-07-04

☁️ Синхронизация между устройствами через облачную папку и налоговый отчёт по
реализованному доходу инвестиций.

### Улучшено
- **Рефакторинг: демо-данные вынесены из `lib/data.ts` в отдельный модуль** (`lib/data/demo-seed.ts`),
  файл уменьшился на ~180 строк. Поведение не изменилось (все тесты и сборки зелёные). Дальнейшая
  декомпозиция крупных файлов и сложных функций — отдельным заходом с проверкой в живом приложении.

### Добавлено
- **Синхронизация между устройствами через облачную папку (десктоп) — без сервера.**
  В настройках → «Данные» можно выбрать папку (которую синхронизирует ваш Dropbox / Google
  Drive / OneDrive), задать пароль, и выгружать/загружать зашифрованный снимок данных
  (AES-256-GCM). На другом устройстве — та же папка и пароль → «Загрузить из облака».
  Пароль нигде не сохраняется; синхронизация ручная (last-write-wins).
- **Журнал реализованного дохода и налоговый отчёт (десктоп).** На вкладке «Инвестиции →
  Аналитика» можно вести журнал продаж и дивидендов; приложение считает годовой отчёт по
  реализованной прибыли и дивидендам с оценкой НДФЛ (13% до 2,4 млн ₽ базы, 15% сверх;
  убытки уменьшают прибыль в пределах года). Дополняет оценку «при продаже сейчас».

## [1.0.17] — 2026-07-04

✨ Крупное обновление: ИИ-аналитик и распознавание чеков, живые курсы валют, сценарии
«что если», налоговая оценка по инвестициям и проактивные уведомления.

### Добавлено
- **Сценарий «что если» на странице «Прогноз».** Прикиньте, как изменится свободный
  остаток, если откладывать больше в месяц или сделать крупную разовую трату: панель
  показывает баланс «как сейчас» против сценария на 6/12/24 месяца и предупреждает,
  если по сценарию баланс уходит в минус.
- **Оценка налога по инвестициям.** На вкладке «Инвестиции → Аналитика» появилась
  ориентировочная оценка НДФЛ, если продать позиции сейчас: прибыль/убыток, налоговая
  база (убытки уменьшают прибыль) и налог по ставке 13% до 2,4 млн ₽ и 15% сверх. Это
  ориентир, а не налоговый отчёт (без ЛДВ, комиссий и дивидендов — их приложение пока
  не отслеживает).
- **Распознавание чека по фото.** В блоке ввода операции появилась кнопка «Фото чека» —
  сфотографируйте или выберите изображение, и ИИ извлечёт сумму, дату и категорию в
  черновик операции (проверьте перед сохранением). Поддерживают Claude и ChatGPT (у
  DeepSeek фото недоступно).
- **ИИ-аналитик «Спросите свои финансы».** На странице «Аналитика» появился блок, где
  можно задать вопрос обычным языком («Куда уходят деньги?», «Где сэкономить?») и получить
  ответ на основе сводки по вашим данным. Работает при включённом ИИ-ассистенте; на десктопе
  использует ваш ключ, на сайте — серверный. Отправляется только компактная сводка (без
  сырых операций).
- **Проактивные системные уведомления.** Если включены напоминания (Настройки →
  Автоматизация), приложение при запуске показывает системные уведомления о срочном:
  превышение бюджета, кассовый разрыв, платёж в ближайшие дни (не только «сегодня»,
  как раньше). Каждое напоминание показывается не чаще раза в день.
- **Живые курсы валют ЦБ РФ (десктоп).** Приложение раз в день подтягивает курсы с
  сайта ЦБ и пересчитывает капитал/чистые активы/аналитику по всем валютам в единую
  сумму (раньше суммы в разных валютах складывались как есть). На странице «Счета» —
  отметка актуальности курсов и кнопка обновления.
- **Выбор валюты счёта.** При создании/редактировании счёта теперь можно выбрать валюту
  (₽/$/€/£/¥/₸) — раньше все счета создавались только в рублях.

### Улучшено
- **Доступность и качество кода.** Скелетоны загрузки используют семантический элемент
  `<output>` (лучше озвучиваются скринридерами); уточнена сортировка дат в графике
  стоимости портфеля. Крупная декомпозиция «god-файлов» вынесена в отдельную задачу.

### Исправлено
- **ИИ-провайдеры OpenAI и DeepSeek заработали в десктопе.** Запросы к их API блокировались
  политикой безопасности (CSP) — в белый список добавлены `api.openai.com` и `api.deepseek.com`
  (а также `cbr.ru` для курсов валют).

## [1.0.16] — 2026-07-04

🤖 Актуальные ИИ-модели и выбор глубины обдумывания.

### Изменено
- **Обновлены модели ИИ-ассистента.** OpenAI — GPT-5.5 / GPT-5.4 / 5.4 mini / 5.4 nano
  (старые gpt-4o/gpt-4.1 сняты вендором); DeepSeek — V4 Flash / V4 Pro (старые
  `deepseek-chat`/`deepseek-reasoner` отключаются провайдером 24 июля 2026); Claude —
  Opus 4.8 / Sonnet 4.6 / Haiku 4.5. Если у вас был выбран устаревший вариант — просто
  выберите модель заново в настройках.

### Добавлено
- **Выбор «глубины обдумывания» ИИ (десктоп):** Быстро / Сбалансированно / Глубоко.
  Глубже — точнее, но медленнее и дороже (для OpenAI управляет reasoning-эффортом, для
  Claude включает расширенное мышление на «Глубоко»).

## [1.0.15] — 2026-07-04

👤 Профиль аккаунта в настройках веб-версии.

### Добавлено
- **Профиль аккаунта (веб).** В настройках → «Аккаунт и безопасность» появился блок
  «Профиль»: можно изменить отображаемое имя, видно email (используется для входа) и
  дату регистрации.

## [1.0.14] — 2026-07-04

🤖 Выбор нейросети для ИИ-ассистента, компактное меню и кнопка скачивания на сайте.

### Добавлено
- **Выбор ИИ-провайдера для ассистента (десктоп).** Теперь можно подключить не только
  Claude (Anthropic), но и **ChatGPT (OpenAI)** или **DeepSeek** — в настройках
  появился выбор провайдера, поля ключа и списка моделей подстраиваются под него.
  Ключ по-прежнему хранится только на вашем устройстве. На сайте провайдер задаёт
  владелец через переменные окружения (`AI_PROVIDER` + ключ соответствующего сервиса).
- **Кнопка «Скачать для компьютера» на экране входа** — со страницы сайта можно сразу
  перейти к установщику десктопного приложения.

### Изменено
- **Меню стало компактнее и понятнее.** Разделы сгруппированы в 6 основных пунктов
  (Главная · Учёт · Планирование · Аналитика · Инвестиции · Настройки); связанные
  страницы открываются вкладками внутри раздела, а не отдельными кнопками в боковом
  меню — человек больше не теряется в длинном списке.

## [1.0.13] — 2026-06-27

🐛 Исправили добавление бумаг в инвестициях и авто-категоризацию операций.

### Исправлено
- **Инвестиции (десктоп): теперь можно добавить любую бумагу Московской биржи** —
  не только из короткого списка. Раньше при попытке добавить найденную бумагу
  (например, ПИФ или акцию вне подборки) в список наблюдения или портфель появлялась
  ошибка «Security not found». Теперь бумага корректно подтягивается с биржи.
- **Авто-категоризация по правилам заработала в форме операции.** Если вы создали
  правило (например, «Пятёрочка» → Продукты), оно теперь срабатывает при вводе
  описания и **перебивает даже вручную выбранную категорию** — больше не нужно
  поправлять категорию руками, если для неё есть правило.

## [1.0.12] — 2026-06-27

📈 Раздел «Инвестиции» стал понятнее с первого взгляда, плюс укрепили безопасность.

### Изменено
- **Полный редизайн страницы инвестиций** — три понятные вкладки с иконками:
  **Обзор · Рынок · Аналитика**. На «Обзоре» сразу, без кликов, видно главное:
  крупная **стоимость портфеля**, **изменение за день** цветом, динамика
  **«Стоимость портфеля во времени»**, полоса **«Где ваши деньги»** и список бумаг
  дружелюбными карточками (тап разворачивает график и детали). У финансовых терминов —
  подсказки «?». Поиск, список наблюдения и подбор по бюджету переехали на «Рынок».

### Исправлено
- Раздел «Инвестиции» больше не падал с ошибкой у новых пользователей и в режиме
  «Загрузить пример»: демо-портфель использовал устаревший тикер Яндекса (`YNDX`),
  переименованный биржей в `YDEX`. Заодно построитель демо-данных стал устойчивым —
  отсутствующая бумага просто пропускается, а не роняет страницу.

### Безопасность
- Идентификаторы записей теперь генерируются криптостойким источником
  (`crypto.getRandomValues`) вместо `Math.random` в резервном пути.
- Эндпоинт настроек 2FA проверяет действие по строгому белому списку
  (setup / enable / disable) до выполнения операции.
- Устранены предупреждения статического анализа CodeQL (5 высокого приоритета + 1).

## [1.0.11] — 2026-06-27

### Добавлено
- **Двухфакторная аутентификация (2FA, TOTP)** для веб-аккаунтов. В «Настройки →
  Аккаунт» можно включить вход по коду из приложения-аутентификатора (Google
  Authenticator, Authy и т.п.): отсканировать QR-код и подтвердить кодом. При входе
  появляется поле для 6-значного кода. Отключение — с подтверждением паролем.
  Полностью опционально: у кого 2FA выключена, вход не меняется. (Десктоп —
  локальный профиль без логина, поэтому 2FA только на вебе.)

### Безопасность
- Денежная логика операций и отмены импорта покрыта тестами (балансы, переводы,
  откат) — общий счёт тестов вырос.

## [1.0.10] — 2026-06-27

### Добавлено
- **График «Стоимость портфеля во времени»** на вкладке «Аналитика» в инвестициях.
  Оценивает текущие позиции по историческим ценам закрытия MOEX (1М/3М/6М/1Г/5Л) —
  видно, как менялась суммарная стоимость портфеля.

### Изменено
- **Оптимизация фоновых обновлений цен.** Реал-тайм опрос MOEX останавливается, когда
  окно/вкладка скрыты, и возобновляется при возврате — экономит сеть и заряд батареи.

## [1.0.9] — 2026-06-27

### Изменено
- **Все выпадающие списки переведены на собственный стиль приложения.** Раньше при
  открытии списка всплывал системный (светлый, не закруглённый) список — потому что
  его рисовала операционная система, и ни цвет, ни скругление поменять было нельзя.
  Теперь это полностью свой компонент: раскрытый список **тёмный, в цвет панелей,
  с закруглёнными углами и аккуратной галочкой выбора**, одинаковый во всех экранах
  (операции, бюджеты, цели, долги, регулярные, инвестиции, настройки, импорт,
  быстрый ввод, прогноз и др.). Работает мышью и с клавиатуры.

## [1.0.8] — 2026-06-27

### Исправлено
- **Выпадающие списки больше не «выбиваются» из тёмной темы.** Раньше при открытии
  списка (например, «На странице», «Категория», «Счёт») всплывал светлый системный
  список с криво смотрящейся галочкой — он рисуется операционной системой и не
  подхватывал тему. Теперь нативным элементам задана цветовая схема приложения
  (`color-scheme`), поэтому раскрытые списки, стрелка и полосы прокрутки тёмные и
  единообразны во всём приложении.

## [1.0.7] — 2026-06-27

📈 Переделан раздел «Инвестиции» — стало удобнее.

### Изменено
- **Раздел «Инвестиции» переработан под брокерский вид.** Вместо одной длинной
  прокрутки — **вкладки**: Портфель / Список наблюдения / Аналитика / Подбор.
- **Сводка портфеля — всегда сверху:** стоимость, изменение за день (в ₽ и %),
  вложено, общий P/L и доходность. Сразу видно главное, без прокрутки.
- **Графики цены открываются понятно:** клик по любой строке (в портфеле или в
  списке наблюдения) **разворачивает график прямо под ней** — без всплывающих окон.
  Переключатели периода (1М/3М/6М/1Г/5Л) на месте.

## [1.0.6] — 2026-06-27

🛠 Релиз с исправлениями: чинит автообновление desktop и цену акций.

### Исправлено
- **Автообновление (desktop).** Установщик в релизе назывался кириллицей
  («Финансовый помощник_…-setup.exe»), а GitHub вырезает не-ASCII символы из имён
  ассетов — из-за чего ссылка в манифесте обновления вела на 404, и установка
  срывалась («невозможно обновить»). Теперь установщик публикуется с ASCII-именем,
  и манифест всегда совпадает с ассетом. Манифест уже вышедшего 1.0.5 тоже исправлен,
  так что обновление с 1.0.4 заработает без переустановки.
- **Цена акций в инвестициях.** Вне торговой сессии показывалась средневзвешенная
  цена MOEX (например, ~296 ₽ у Сбербанка) вместо реальной цены закрытия (299,18 ₽).
  Теперь приоритет такой: цена последней сделки (в течение дня) → официальная цена
  закрытия → средневзвешенная только как крайний случай. Дневное изменение вне сессии
  тоже считается по ценам закрытия, а не показывает 0%.

### Добавлено
- **Открытие страницы релизов на desktop.** Если автообновление всё же не удалось,
  кнопка теперь действительно открывает страницу релизов в системном браузере
  (плагин opener) — раньше webview блокировал переход, и не происходило ничего.
  Причина ошибки обновления теперь пишется в лог для диагностики.

## [1.0.5] — 2026-06-27

🌍 **The app is now fully bilingual (RU/EN)** and the investments screen works on
real market data. This release also closes a round of security hardening ahead of
a public deployment.

### Added
- **Full English localization.** The entire product — navigation, every screen,
  forms, errors, and *generated* content (recommendations, insights, forecast
  warnings, investment analysis, goal pacing, health summary) — now switches
  between Russian and English. Toggle the language in Settings.
- **Investments on real data.** Live MOEX quotes, search for any Russian security,
  click a holding to open its historical price chart, and a portfolio summary with
  per-position profit/loss.
- **Budget rollover.** An unspent budget can carry its remainder into the next month.
- **Inline create** of an account or category directly from the transaction form —
  no need to leave the screen.

### Changed
- **Responsive width.** Content now stretches to fill the screen on large displays,
  with a tidier field grid in Settings (better use of 24″+ monitors).

### Security
- **Backup endpoint locked down.** `/api/backup` now requires authentication and is
  scoped to the signed-in user (previously it exposed/overwrote the first user's
  full data with no auth).
- **HTTPS-only by default.** The web container is no longer published on the host —
  all traffic goes through the TLS reverse proxy. `POSTGRES_PASSWORD` is now required.
- **Content-Security-Policy** added for the web app; Sentry now scrubs PII before
  sending; API errors no longer leak internal messages to clients.
- CSV import is size/row-bounded (DoS protection); CSV export escapes spreadsheet
  formulas; login is throttled per account; nightly DB backups can be encrypted at
  rest. The AI key is no longer persisted server-side on the web.

### Fixed
- Budget calculation corrections from a full finance/accounting audit of the math.

## [1.0.4] — 2026-06-25

### Changed
- **Settings redesigned**: a long single-scroll page became a sectioned layout
  with a left section nav (top scrollable tabs on mobile), a settings search, and
  larger touch targets. Account, data-management and "about" are folded in; the
  desktop-only local-mode panel and confusing copy were cleaned up.

### Fixed
- **Desktop auto-update**: diagnosed why v1.0.2 → v1.0.3 failed — the updater
  signing key was rotated between those releases, so v1.0.2 (which has the old
  public key baked in) can't verify v1.0.3's signature. This can't be repaired
  retroactively (install the new version manually once). The key is now pinned by
  a guard test, and the release workflow cryptographically verifies the build's
  signature against the baked public key before publishing — so a build that
  installed clients can't verify is never released. The displayed version now
  comes from package.json (was a stale hardcoded "1.0.2").
- No console errors / spurious Sentry reports on public pages (login/register):
  the data layer no longer logs the expected "no session" state, and the
  automation runner no longer calls authenticated endpoints there.
- Onboarding dialog no longer pops over the registration form; its welcome copy
  is now correct for the web (account-based, not "data on this device").
- Settings showed version 1.0.2 — the displayed version is now sourced from
  package.json (`NEXT_PUBLIC_APP_VERSION`) and can't go stale.
- The desktop "local mode" snapshot panel is hidden on the web app.

### Added
- Account self-service (web): change password in-session
  (`POST /api/account/password`) and delete account with all data
  (`DELETE /api/account`, 152-ФЗ right to erasure), both confirmed by password.
- Explicit consent checkbox at registration (active consent to Terms & Privacy).
- Product "front door": a value-proposition panel next to the login/register
  form on large screens.

### Security
- Login attempts are rate-limited per IP (brute-force / credential-stuffing).
- `Strict-Transport-Security` (HSTS) header for HTTPS deployments.

### SEO / PWA
- OpenGraph metadata, keywords, and `robots.txt`.
- PNG app icons (favicon, apple-touch, 192/512 + maskable) alongside SVG.

### CI
- GitHub Actions upgraded to current majors (resolves Node 20 deprecation).

## [1.0.3] — 2026-06-24

### Added
- Web parity with desktop:
  - Auto-categorization rules on the web (`Rule` model, `/api/rules`); rules are
    applied on CSV import and take priority over the history-based suggestion.
  - Batch auto-posting of all due recurring payments on the web
    (`/api/recurring/materialize-all`); the "auto-post recurring" setting now
    works in both modes.
  - Undo last CSV import on the web (`importBatchId`, `/api/import/undo`) with
    account-balance rollback.
- Dashboard: net-worth breakdown by component (accounts / investments / goals / debts).
- Command palette: search individual transactions by description.
- Empty state: "Load demo data" button in the setup checklist when there are no
  accounts or transactions yet.
- Internationalization: lightweight RU/EN layer with a language switcher in
  Settings; navigation and the error screen are translated (incremental, falls
  back to Russian).

### Changed
- Performance: charts (Recharts) are lazy-loaded via `next/dynamic`, removing the
  heavy charting bundle from the initial load.
- UX: skeleton loaders instead of spinners on key pages; budget overrun is
  highlighted directly on the card.

### Accessibility
- Text alternatives (`role="img"` + `aria-label`) for all charts.

### Deferred (v1.0.4)
- Email password reset (needs SMTP) and OAuth providers.
- Full content-string translation; AI-prompt language on the server path.
- Budget rollover; custom domain and trusted TLS certificate.

## [1.0.1] — 2026-06-21

### Added
- Configurable display currency (RUB/USD/EUR/GBP/CNY/KZT) in Settings.
- Goal cards show pacing context (months left / reached / overdue).
- Finance health score now lists the factors that cost points.
- CSV import detects and can skip duplicate rows.
- Forecast events can be filtered by account and category.
- Backup safety improvements: local schema v2, last-backup reminder, restore preview before replacing data.
- CSV import presets for Sber, T-Bank, Alfa-Bank, and VTB column layouts.
- Analytics insights: savings-rate trend, month-over-month expense change, and short actionable notes.
- Expanded MOEX watchlist universe with additional liquid Russian equities.
- Coverage thresholds, Prettier, husky pre-commit, and Playwright E2E for the desktop build.
- Settings action to replay onboarding after the first launch.

### Changed
- Destructive confirmations (delete goal/profile, reset budget limit) use a styled dialog instead of the browser prompt.
- Mobile secondary-navigation tap targets enlarged to ~44px.
- Faster desktop reads: the parsed local state is cached per profile.
- Onboarding footer now adapts on narrow screens without buttons overflowing the dialog.
- Finance hints now render in a body-level portal, stay inside the viewport, and are not clipped by cards.
- Chart tooltips can escape chart bounds near edges instead of disappearing inside the plot area.
- Web production builds now avoid request-only `connection()` hangs and skip live DB reads during build-time fallback generation.
- Docker build target uses Node 24 and explicit standalone Next.js output settings.

### Fixed
- Recurring transactions created without an explicit active flag now default to active.

## [1.0.0] — 2026-05-30

### Added
- Full CRUD for personal finance: transactions, accounts, categories, budgets, goals, recurring payments
- Category management with color picker, isEssential and isSubscription flags
- 90-day cashflow forecast with upcoming event calendar and cash-flow gap warnings
- Investment portfolio tracker: watchlist, P/L, sector structure, risk analysis
- Analytics dashboard: 6-month income/expense trends, savings rate, top spending categories
- Quick Add FAB for fast transaction entry on mobile and desktop
- Dashboard financial health score (0–100) with monthly trend badges
- Goal deposit action ("Пополнить") with current amount tracking
- Budget monthly history: view spending for previous months
- CSV import with column mapping and duplicate detection; export to CSV and JSON
- Full JSON backup and restore; import undo (desktop local mode)
- PWA: manifest, service worker, offline page, mobile-first layout
- Tauri Windows desktop app: offline local mode, NSIS installer
- Capacitor Android build configuration
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Custom 404 and error boundary pages
- Per-route loading states
- Keyboard shortcuts (Alt+N, Alt+T, Alt+D, Alt+A, ?)
- Print/PDF support for analytics page
- MOEX ISS API integration for live Russian stock prices

### Technical
- Next.js 16 App Router, TypeScript strict mode
- Prisma ORM with PostgreSQL; demo fallback for no-DB environments
- LocalApiClient for full offline functionality (no server required)
- 9 test files, 40+ tests covering financial calculations, CSV parsing, API client

## [0.1.0] — 2026-05-27

### Added
- Initial MVP release
