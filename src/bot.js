require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config/config');
const commandHandlers = require('./handlers/commandHandlers');
const logger = require('./utils/logger');

// Список поддерживаемых команд
const SUPPORTED_COMMANDS = ['/start', '/chart', '/stats', '/rules', '/subscribe', '/unsubscribe', '/time', '/results'];

class Bot {
    constructor() {
        this.bot = null;
        this.validateConfig();
    }

    validateConfig() {
        if (!config.TELEGRAM_BOT_TOKEN) {
            logger.error('Токен Telegram бота не указан в файле .env');
            process.exit(1);
        }
    }

    initialize() {
        try {
            this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
            this.setupErrorHandling();
            
            // Инициализируем обработчики команд до их регистрации
            commandHandlers.initialize(this.bot);
            
            this.registerCommands();
            this.setupCleanup();
            
            // Добавляем обработчик для сообщений и callback query
            this.bot.on('message', async (msg) => {
                try {
                    logger.info(`Получено сообщение: ${msg.text} от ${msg.from.username} в чате ${msg.chat.id} (тип: ${msg.chat.type})`);
                    
                    // Проверяем наличие текста в сообщении
                    if (!msg.text) {
                        logger.debug('Сообщение не содержит текста');
                        return;
                    }

                    // Дополнительное логирование для групповых чатов
                    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
                        logger.info(`Обработка сообщения в групповом чате ${msg.chat.title} (${msg.chat.id})`);
                    }

                    // Проверяем, содержит ли сообщение время (две цифры до и после двоеточия)
                    const timeRegex = /([0-9]{1,2}):([0-9]{1,2})/;
                    const timeMatch = msg.text.match(timeRegex);
                    
                    if (timeMatch) {
                        // Если это время, обрабатываем как голос
                        const handled = await commandHandlers.handleMessage(msg);
                        if (handled) {
                            logger.info(`Сообщение обработано как голос в опросе: ${timeMatch[0]}`);
                            return;
                        }
                    }

                    // Если это команда, обрабатываем как команду
                    if (msg.text.startsWith('/')) {
                        logger.debug(`Обработка как команда: ${msg.text}`);
                        return;
                    }

                    // Для остальных сообщений проверяем на наличие времени
                    const handled = await commandHandlers.handleMessage(msg);
                    if (handled) {
                        logger.info(`Сообщение обработано как голос в опросе: ${msg.text}`);
                    } else {
                        logger.debug(`Сообщение не обработано как голос: ${msg.text}`);
                    }
                } catch (error) {
                    logger.error('Ошибка при обработке сообщения:', error);
                }
            });

            this.bot.on('callback_query', async (query) => {
                await commandHandlers.handleCallbackQuery(query);
            });
            
            logger.info('Бот успешно инициализирован и запущен');
        } catch (error) {
            logger.error('Ошибка при инициализации бота:', error);
            process.exit(1);
        }
    }

    setupErrorHandling() {
        this.bot.on('polling_error', (error) => {
            logger.error('Ошибка при подключении к Telegram API:', error);
            if (error.code === 'ETELEGRAM' && error.message.includes('404 Not Found')) {
                logger.error('Возможно, указан неверный токен бота. Проверьте токен в файле .env');
            }
        });

        process.on('unhandledRejection', (error) => {
            logger.error('Необработанная ошибка Promise:', error);
        });

        process.on('uncaughtException', (error) => {
            logger.error('Необработанная ошибка:', error);
            if (commandHandlers.subscribers.size > 0) {
                commandHandlers.startMonitoring();
            }
        });
    }

    registerCommands() {
        // Регистрация основных команд
        SUPPORTED_COMMANDS.forEach(command => {
            const handler = command.substring(1); // Убираем '/' из команды
            const handlerName = `handle${handler.charAt(0).toUpperCase() + handler.slice(1)}`;
            this.bot.onText(new RegExp(`^${command}$`), async (msg) => {
                try {
                    await commandHandlers[handlerName](msg);
                } catch (error) {
                    logger.error(`Ошибка при выполнении команды ${command}:`, error);
                }
            });
        });

        // Обработка команды sticks и её вариаций
        this.bot.onText(/\/(sticks|stics|stick|палки)\s+(.+)/, async (msg, match) => {
            try {
                const args = match[2].split(' ');
                await commandHandlers.handleSticks(msg, args);
            } catch (error) {
                logger.error('Ошибка при выполнении команды sticks:', error);
            }
        });

        // Обработка команды sticks без аргументов
        this.bot.onText(/\/(sticks|stics|stick|палки)$/, async (msg) => {
            try {
                await this.bot.sendMessage(msg.chat.id,
                    '❗️ Использование команды:\n' +
                    '/sticks <имя> <количество>\n\n' +
                    'Например:\n' +
                    '/sticks Иван 5\n\n' +
                    '📝 Команда изменит количество палок у указанного участника.'
                );
            } catch (error) {
                logger.error('Ошибка при отправке справки по команде sticks:', error);
            }
        });

        // Обработка неизвестных команд
        this.bot.onText(/\/.*/, async (msg) => {
            try {
                // Проверяем, не является ли это временем
                const timeRegex = /([0-9]{1,2}):([0-9]{1,2})/;
                if (timeRegex.test(msg.text)) {
                    return; // Игнорируем сообщения с форматом времени
                }

                const command = msg.text.split(' ')[0].toLowerCase();
                if (!SUPPORTED_COMMANDS.includes(command) && 
                    !['/sticks', '/stics', '/stick', '/палки'].includes(command)) {
                    await this.handleUnknownCommand(msg);
                }
            } catch (error) {
                logger.error('Ошибка при обработке неизвестной команды:', error);
            }
        });
    }

    async handleUnknownCommand(msg) {
        try {
            await this.bot.sendMessage(msg.chat.id, 
                '❌ Неизвестная команда\n\n' +
                'Доступные команды:\n' +
                '/chart - столбчатая диаграмма\n' +
                '/stats - текстовая статистика\n' +
                '/rules - правила\n' +
                '/sticks - изменить количество палок\n' +
                '/subscribe - подписаться на уведомления\n' +
                '/unsubscribe - отписаться от уведомлений\n' +
                '/time - создать опрос "Во сколько играем?"\n' +
                '/results - показать результаты опроса'
            );
        } catch (error) {
            logger.error('Ошибка при отправке сообщения о неизвестной команде:', error);
        }
    }

    setupCleanup() {
        const cleanup = () => {
            logger.info('Получен сигнал остановки, завершаю работу...');
            commandHandlers.stopMonitoring();
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
    }
}

// Создаем и запускаем бота
const telegramBot = new Bot();
telegramBot.initialize(); 