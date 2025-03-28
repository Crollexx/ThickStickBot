# Telegram бот для отображения диаграмм из Google таблицы "Палочники"

Этот бот получает данные из указанной Google таблицы, создает диаграммы и отправляет уведомления об изменениях.

## Возможности

- 📊 Создание столбчатых диаграмм
- 📈 Отображение текстовой статистики
- 📜 Просмотр правил
- 🔔 Подписка на уведомления об изменениях
- 🤖 Автоматическое обнаружение изменений
- 📱 Удобный интерфейс в Telegram

## Требования

- Node.js 16+
- Telegram аккаунт
- Google аккаунт с доступом к Google Sheets API

## Установка

1. Клонируйте репозиторий или скачайте файлы проекта
2. Установите зависимости:
   ```bash
   npm install
   ```

## Настройка

### 1. Создание Telegram бота

1. Откройте Telegram и найдите @BotFather
2. Отправьте команду `/newbot`
3. Следуйте инструкциям для создания нового бота
4. Получите токен бота и сохраните его

### 2. Настройка доступа к Google Sheets API

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект
3. Включите Google Sheets API для проекта
4. Создайте сервисный аккаунт:
   - Перейдите в "IAM и администрирование" > "Сервисные аккаунты"
   - Нажмите "Создать сервисный аккаунт"
   - Заполните необходимые поля и нажмите "Создать"
   - Добавьте роль "Редактор" или "Читатель"
   - Нажмите "Готово"
5. Создайте ключ для сервисного аккаунта:
   - Найдите созданный сервисный аккаунт в списке
   - Нажмите на три точки в строке аккаунта и выберите "Управление ключами"
   - Нажмите "Добавить ключ" > "Создать новый ключ"
   - Выберите формат JSON и нажмите "Создать"
   - Сохраните загруженный файл как `credentials.json` в корневой папке проекта

### 3. Настройка доступа к Google таблице

1. Откройте вашу Google таблицу
2. Нажмите кнопку "Поделиться" в правом верхнем углу
3. Добавьте email сервисного аккаунта (он указан в файле credentials.json) с правами на чтение

### 4. Настройка переменных окружения

1. Создайте файл `.env` в корне проекта
2. Добавьте следующие переменные:
   ```
   TELEGRAM_BOT_TOKEN=ваш_токен_бота
   GOOGLE_SPREADSHEET_ID=id_вашей_таблицы
   GOOGLE_SHEET_RANGE=A:B
   ```

## Запуск бота

```bash
node src/bot.js
```

## Использование

1. Найдите вашего бота в Telegram по имени
2. Доступные команды:
   - `/start` - начало работы, показать список команд
   - `/chart` - получить столбчатую диаграмму
   - `/stats` - получить текстовую статистику
   - `/rules` - посмотреть правила
   - `/subscribe` - подписаться на уведомления об изменениях
   - `/unsubscribe` - отписаться от уведомлений

## Структура проекта

```
├── src/
│   ├── bot.js              # Основной файл бота
│   ├── config/            # Конфигурации
│   ├── handlers/          # Обработчики команд
│   └── services/          # Сервисы (Google Sheets, диаграммы)
├── .env                   # Переменные окружения
├── credentials.json       # Учетные данные Google API
├── package.json          # Зависимости проекта
└── README.md            # Документация
```

## Технические детали

Бот использует:
- `node-telegram-bot-api` для работы с Telegram Bot API
- `googleapis` для работы с Google Sheets API
- `quickchart-js` для создания диаграмм

## Особенности

- Автоматическое определение имени первого листа в таблице
- Кэширование данных для оптимизации запросов
- Автоматическое удаление неактивных подписчиков
- Обработка ошибок и автоматическое восстановление
- Поддержка Markdown в сообщениях

## Лицензия

MIT

## Развертывание на сервере

### Предварительные требования

1. Установленный Docker и Docker Compose
2. Токен Telegram бота
3. Учетные данные Google Sheets API (credentials.json)

### Шаги по установке

1. Клонируйте репозиторий:
```bash
git clone <ваш-репозиторий>
cd <папка-проекта>
```

2. Создайте файл .env с необходимыми переменными окружения:
```bash
TELEGRAM_BOT_TOKEN=ваш_токен_бота
SPREADSHEET_ID=ид_вашей_таблицы
```

3. Скопируйте файл credentials.json с учетными данными Google Sheets API в корневую директорию проекта.

4. Запустите приложение с помощью Docker Compose:
```bash
docker-compose up -d
```

### Управление приложением

- Просмотр логов:
```bash
docker-compose logs -f
```

- Перезапуск бота:
```bash
docker-compose restart
```

- Остановка бота:
```bash
docker-compose down
```

### Обновление приложения

1. Получите последние изменения:
```bash
git pull
```

2. Пересоберите и перезапустите контейнер:
```bash
docker-compose up -d --build
```

### Мониторинг

- Проверка статуса контейнера:
```bash
docker-compose ps
```

- Просмотр использования ресурсов:
```bash
docker stats
```

### Резервное копирование

Все данные подписчиков хранятся в директории `./data`. Рекомендуется регулярно создавать резервные копии этой директории.

### Устранение неполадок

1. Если бот не отвечает:
   - Проверьте логи: `docker-compose logs -f`
   - Проверьте статус контейнера: `docker-compose ps`
   - Перезапустите контейнер: `docker-compose restart`

2. Если возникают проблемы с правами доступа:
   - Проверьте права на файлы credentials.json и .env
   - Убедитесь, что директория data доступна для записи

3. Если проблемы с Google Sheets:
   - Проверьте валидность credentials.json
   - Убедитесь, что у сервисного аккаунта есть доступ к таблице 