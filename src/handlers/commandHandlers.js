const googleSheets = require('../services/googleSheets');
const chartService = require('../services/chartService');
const logger = require('../utils/logger');
const config = require('../config/config');
const path = require('path');
const fs = require('fs');

// Сообщения для команд
const MESSAGES = {
    WELCOME: () => '👋 Привет! Я бот для подсчета палок.\n\n' +
        'Доступные команды:\n' +
        '/chart - столбчатая диаграмма\n' +
        '/stats - текстовая статистика\n' +
        '/rules - правила\n' +
        '/sticks - изменить количество палок\n' +
        '/subscribe - подписаться на уведомления\n' +
        '/unsubscribe - отписаться от уведомлений\n' +
        '/time - создать опрос "Во сколько играем?"',

    RULES: '📜 *Правила получения и списания палок:*\n\n' +
        '1️⃣ Палку получает тот кто не играл в текущий день\n\n' +
        '2️⃣ При появлении ситуации, где нужно решать играет чел или нет, внимание обращается на палки и в случаи его не участия в игре по причине большего кол-ва палок у него все палки обнуляются на следующий день\n\n' +
        '3️⃣ Расчётное время начисления палок 00:00 по Члб\n\n' +
        '4️⃣ При спорных ситуациях при начислении палок, решают данную ситуацию первых 3 человека у которых меньше всего палок\n\n' +
        '5️⃣ Если из за участника нет возможности играть рейтинговую игру, то путем голосования принимается решение получает он палку или нет\n\n' +
        '6️⃣ Оспорить начисление палки можно в письменной форме в чате, срок рассмотрения составляет одни сутки\n\n' +
        '7️⃣ При голосовании если участник проголосовал "Я" но при этом не явился, то за оскорбления чувств тимейтов накладывается штраф в размере 2 палок (1 палка за вранье, 1 палка за то что не играл)\n\n' +
        '7️⃣.1️⃣ В случаях, когда человек в указанное время не явился, но все равно успел до расчётного времени, в таком случае решение выносят те, кто играет в данный момент путем голосования'
};

// Добавляем сопоставление username и имен
const USERNAME_MAPPING = {
    'crollexx': 'Вячеслав',
    'Nikita_toki': 'Никита',
    'FreeddD': 'Макс',
    'st_ben': 'Вадим(Бен)',
    'Furkalyuk_S': 'Серёжа(Фурик)',
    'VladimirHeonia': 'Володя',
    'Palladiy_10': 'Алёша',
    
};

class CommandHandlers {
    constructor() {
        this.subscribers = new Set();
        this.lastData = null;
        this.checkInterval = null;
        this.bot = null;
        this.subscribersFile = path.join(process.cwd(), 'subscribers.json');
        this.loadSubscribers();
        this.activeTimePolls = new Map(); // Хранилище активных опросов о времени
    }

    // Общий обработчик ошибок для отправки сообщений
    async handleError(chatId, error, context) {
        logger.error(`Ошибка в ${context}:`, error);
        if (this.bot) {
            await this.bot.sendMessage(chatId, `Произошла ошибка при ${context}. Пожалуйста, попробуйте позже.`);
        }
    }

    // Инициализация обработчика с ботом
    initialize(bot) {
        this.bot = bot;
        this.startMonitoring();
        logger.info('CommandHandlers инициализирован с ботом');
    }

    // Загрузка списка подписчиков из файла
    loadSubscribers() {
        try {
            if (fs.existsSync(this.subscribersFile)) {
                const data = fs.readFileSync(this.subscribersFile, 'utf8');
                const subscribers = JSON.parse(data);
                this.subscribers = new Set(subscribers);
                logger.info(`Загружено ${this.subscribers.size} подписчиков`);
            }
        } catch (error) {
            logger.error('Ошибка при загрузке списка подписчиков:', error);
            this.saveSubscribers();
        }
    }

    // Сохранение списка подписчиков в файл
    saveSubscribers() {
        try {
            fs.writeFileSync(this.subscribersFile, JSON.stringify(Array.from(this.subscribers)));
            logger.info(`Сохранено ${this.subscribers.size} подписчиков`);
        } catch (error) {
            logger.error('Ошибка при сохранении списка подписчиков:', error);
        }
    }

    async handleStart(msg) {
        await this.bot.sendMessage(msg.chat.id, MESSAGES.WELCOME());
    }

    async handleChart(msg) {
        try {
            await this.bot.sendMessage(msg.chat.id, 'Получаю данные из таблицы и создаю диаграмму...');
            
            const { data } = await googleSheets.getData();
            const chartBuffer = await chartService.createBarChart(data);
            
            await this.bot.sendPhoto(msg.chat.id, chartBuffer);
        } catch (error) {
            logger.error('Ошибка при создании диаграммы:', error);
            await this.bot.sendMessage(
                msg.chat.id,
                '❌ Ошибка при создании диаграммы. Пожалуйста, попробуйте позже.'
            );
        }
    }

    async handleStats(msg) {
        try {
            const chatId = msg.chat.id;
            await this.bot.sendMessage(chatId, 'Получаю статистику по палочникам...');
            
            const { data } = await googleSheets.getData();
            
            const filteredData = this.filterAndSortData(data);
            if (filteredData.length === 0) {
                await this.bot.sendMessage(chatId, 'В таблице нет данных для отображения.');
                return;
            }

            const message = this.formatStatsMessage(filteredData);
            await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Ошибка в получении статистики:', error);
            if (msg && msg.chat && msg.chat.id) {
                await this.bot.sendMessage(
                    msg.chat.id,
                    '❌ Ошибка при получении статистики. Пожалуйста, попробуйте позже.'
                );
            }
        }
    }

    filterAndSortData(data) {
        return data
            .filter(item => {
                if (!item['Имя']) return false;
                
                const name = item['Имя'].toString().toLowerCase().trim();
                if (name === '') return false;
                
                // Исключаем строки, которые содержат цифры с точкой (правила)
                if (/^\d+\./.test(item['Имя'])) return false;
                
                // Исключаем строки с ключевыми словами правил
                const ruleKeywords = [
                    'правила',
                    'палку получает',
                    'при появлении',
                    'расчётное время',
                    'при спорных',
                    'если из за',
                    'оспорить'
                ];
                
                return !ruleKeywords.some(keyword => name.includes(keyword));
            })
            .map(item => ({
                ...item,
                'Кол-во палок': parseFloat(item['Кол-во палок']) || 0
            }))
            .sort((a, b) => b['Кол-во палок'] - a['Кол-во палок']);
    }

    formatStatsMessage(data) {
        let message = '📊 *Статистика по палочникам*\n\n';
        
        // Статистика по игрокам
        data.forEach((item, index) => {
            const sticks = parseFloat(item['Кол-во палок']) || 0;
            let emoji;
            if (index === 0) emoji = '🥇 Ебать ты лох';
            else if (index === 1) emoji = '🥈';
            else if (index === 2) emoji = '🥉';
            else emoji = sticks > 0 ? '😐' : '😇';
            
            message += `${emoji} *${item['Имя']}*: ${sticks} палок\n`;
        });

        // Общая статистика
        const totalPlayers = data.length;
        const totalSticks = data.reduce((sum, item) => sum + (parseFloat(item['Кол-во палок']) || 0), 0);
        const averageSticks = totalSticks / totalPlayers;

        message += '\n📈 *Общая статистика:*\n';
        message += `👥 Всего участников: ${totalPlayers}\n`;
        message += `🧮 Всего палок: ${totalSticks}\n`;
        message += `📊 Среднее количество палок: ${averageSticks.toFixed(2)}\n`;

        message += '\nДля просмотра правил используйте команду /rules';

        return message;
    }

    handleRules(msg) {
        this.bot.sendMessage(msg.chat.id, MESSAGES.RULES, { parse_mode: 'Markdown' });
    }

    async handleSubscribe(msg) {
        const chatId = msg.chat.id;
        try {
            if (this.subscribers.has(chatId)) {
                await this.bot.sendMessage(chatId, 'Вы уже подписаны на уведомления об изменениях в таблице.');
                return;
            }

            const currentData = await googleSheets.getData();
            this.lastData = currentData;
            
            this.subscribers.add(chatId);
            this.saveSubscribers();

            if (!this.checkInterval) {
                this.startMonitoring();
            }

            await this.sendSubscriptionConfirmation(chatId);
        } catch (error) {
            logger.error('Ошибка при подписке:', error);
            await this.bot.sendMessage(
                chatId,
                '❌ Ошибка при подписке. Пожалуйста, попробуйте позже.'
            );
        }
    }

    async sendSubscriptionConfirmation(chatId) {
        await this.bot.sendMessage(chatId, 
            'Вы успешно подписались на уведомления об изменениях в таблице.\n' +
            'Вы будете получать уведомления, когда изменится количество палок у участников.\n' +
            'Для отмены подписки используйте команду /unsubscribe'
        );

        await this.bot.sendMessage(chatId, 
            '🔄 *Тестовое уведомление*\n\n' +
            'Система мониторинга активирована и работает.\n' +
            'Вы будете получать уведомления при изменении данных в таблице.',
            { parse_mode: 'Markdown' }
        );

        logger.info(`Пользователь ${chatId} подписался на обновления. Всего подписчиков: ${this.subscribers.size}`);
    }

    async handleUnsubscribe(msg) {
        const chatId = msg.chat.id;
        try {
            if (!this.subscribers.has(chatId)) {
                await this.bot.sendMessage(chatId, 'Вы не подписаны на уведомления об изменениях в таблице.');
                return;
            }

            this.subscribers.delete(chatId);
            this.saveSubscribers();

            if (this.subscribers.size === 0) {
                this.stopMonitoring();
            }

            await this.bot.sendMessage(chatId, 'Вы успешно отписались от уведомлений об изменениях в таблице.');
            logger.info(`Пользователь ${chatId} отписался от обновлений. Всего подписчиков: ${this.subscribers.size}`);
        } catch (error) {
            logger.error('Ошибка при отписке:', error);
            await this.bot.sendMessage(
                chatId,
                '❌ Ошибка при отписке. Пожалуйста, попробуйте позже.'
            );
        }
    }

    startMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        // Запускаем первую проверку сразу
        this.checkUpdates().catch(error => {
            logger.error('Ошибка при первой проверке обновлений:', error);
        });

        // Устанавливаем интервал проверки
        this.checkInterval = setInterval(() => {
            this.checkUpdates().catch(error => {
                logger.error('Ошибка при проверке обновлений:', error);
            });
        }, config.CHECK_INTERVAL);

        logger.info('Мониторинг изменений запущен');
    }

    stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            logger.info('Мониторинг изменений остановлен');
        }
    }

    async checkUpdates() {
        if (!this.bot || this.subscribers.size === 0) {
            logger.debug('Пропуск проверки обновлений: нет бота или подписчиков');
            return;
        }

        try {
            // Принудительно получаем свежие данные без использования кэша
            const currentData = await googleSheets.forceUpdate();
            
            if (!this.lastData) {
                this.lastData = currentData;
                logger.debug('Первичное получение данных для сравнения');
                return;
            }

            const changes = this.detectChanges(this.lastData.data, currentData.data);
            
            if (changes.length > 0) {
                await this.notifySubscribers(changes);
                this.lastData = currentData;
                logger.info(`Обнаружено ${changes.length} изменений, уведомления отправлены`);
            } else {
                logger.debug('Изменений не обнаружено');
            }
        } catch (error) {
            logger.error('Ошибка при проверке обновлений:', error);
        }
    }

    detectChanges(oldData, newData) {
        const changes = [];
        const oldMap = new Map(oldData.map(item => [item['Имя'], item['Кол-во палок']]));
        const newMap = new Map(newData.map(item => [item['Имя'], item['Кол-во палок']]));

        // Проверяем изменения и новые записи
        for (const [name, newSticks] of newMap) {
            const oldSticks = oldMap.get(name);
            if (oldSticks === undefined) {
                changes.push({ name, oldSticks: null, newSticks });
            } else if (Number(oldSticks) !== Number(newSticks)) {
                changes.push({ name, oldSticks, newSticks });
            }
        }

        // Проверяем удаленные записи
        for (const [name, oldSticks] of oldMap) {
            if (!newMap.has(name)) {
                changes.push({ name, oldSticks, newSticks: null });
            }
        }

        return changes;
    }

    async notifySubscribers(changes) {
        if (changes.length === 0 || this.subscribers.size === 0 || !this.bot) {
            return;
        }

        const message = this.formatChangesMessage(changes);
        const failedSubscribers = await this.sendNotifications(message);
        
        if (failedSubscribers.size > 0) {
            this.removeInactiveSubscribers(failedSubscribers);
        }
    }

    formatChangesMessage(changes) {
        let message = '🔄 *Обновление данных в таблице:*\n\n';
        
        changes.forEach(change => {
            if (change.oldSticks === null) {
                message += `➕ Добавлен участник *${change.name}* с ${change.newSticks} палками\n`;
            } else if (change.newSticks === null) {
                message += `➖ Удален участник *${change.name}* (было ${change.oldSticks} палок)\n`;
            } else {
                const diff = Number(change.newSticks) - Number(change.oldSticks);
                const emoji = diff > 0 ? '📈' : (diff < 0 ? '📉' : '🔄');
                message += `${emoji} *${change.name}*: ${change.oldSticks} → ${change.newSticks} палок (${diff > 0 ? '+' : ''}${diff})\n`;
            }
        });

        message += '\nИспользуйте /stats для просмотра текущей статистики или /chart для просмотра диаграммы';
        return message;
    }

    async sendNotifications(message) {
        const failedSubscribers = new Set();

        for (const chatId of this.subscribers) {
            try {
                await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                logger.debug(`Уведомление отправлено пользователю ${chatId}`);
            } catch (error) {
                logger.error(`Ошибка при отправке уведомления пользователю ${chatId}:`, error);
                if (error.code === 403) {
                    failedSubscribers.add(chatId);
                    logger.info(`Пользователь ${chatId} будет удален из подписчиков из-за блокировки бота`);
                }
            }
        }

        return failedSubscribers;
    }

    removeInactiveSubscribers(failedSubscribers) {
        failedSubscribers.forEach(chatId => {
            this.subscribers.delete(chatId);
        });
        this.saveSubscribers();
        logger.info(`Удалено ${failedSubscribers.size} неактивных подписчиков`);
    }

    async handleTime(msg) {
        const chatId = msg.chat.id;
        const username = msg.from.username;
        
        logger.info(`Создание опроса в чате ${chatId} от пользователя @${username}`);
        
        const creatorName = USERNAME_MAPPING[username];

        try {
            // Проверяем, есть ли уже активный опрос
            if (this.activeTimePolls.has(chatId)) {
                logger.warn(`Попытка создать второй опрос в чате ${chatId}`);
                await this.bot.sendMessage(
                    chatId,
                    '❌ В этом чате уже есть активный опрос о времени. Дождитесь его завершения или посмотрите результаты.'
                );
                return;
            }

            // Молча игнорируем неизвестных пользователей
            if (!creatorName) {
                logger.debug(`Игнорируем попытку создания опроса от неизвестного пользователя @${username}`);
                return;
            }

            // Создаем новый опрос
            this.activeTimePolls.set(chatId, {
                votes: new Map(),
                createdAt: new Date(),
                creator: creatorName,
                messageId: null
            });
            
            logger.info(`Создан новый опрос в чате ${chatId} от ${creatorName}`);

            // Отправляем сообщение с опросом
            const message = await this.bot.sendMessage(
                chatId,
                `⏰ *Во сколько играем?*\nСоздал опрос: ${creatorName}\n\n` +
                `Чтобы проголосовать, отправьте время в формате ЧЧ:ММ (например, 16:30)\n` +
                `Доступное время: с 16:00 до 23:55 с интервалом в 5 минут\n\n` +
                `Для просмотра результатов используйте команду /results`,
                {
                    parse_mode: 'Markdown'
                }
            );

            // Сохраняем ID сообщения с опросом
            this.activeTimePolls.get(chatId).messageId = message.message_id;
            logger.info(`Сообщение с опросом создано в чате ${chatId}, messageId: ${message.message_id}`);

        } catch (error) {
            logger.error(`Ошибка при создании опроса в чате ${chatId}:`, error);
            await this.handleError(chatId, error, 'создании опроса о времени');
        }
    }

    async handleMessage(msg) {
        if (!msg.text) {
            logger.debug('Получено сообщение без текста');
            return false;
        }

        const chatId = msg.chat.id;
        const username = msg.from.username;
        const name = USERNAME_MAPPING[username];

        // Молча игнорируем сообщения от неизвестных пользователей
        if (!name) {
            logger.debug(`Игнорируем сообщение от неизвестного пользователя @${username} в чате ${chatId}`);
            return false;
        }
        
        logger.info(`Обработка сообщения в чате ${chatId} (${msg.chat.type}) от @${username}: ${msg.text}`);
        
        // Проверяем, есть ли активный опрос
        const activePoll = this.activeTimePolls.get(chatId);
        if (!activePoll) {
            logger.debug(`Нет активного опроса в чате ${chatId}`);
            return false;
        }

        // Проверяем формат времени в любом месте сообщения
        const timeRegex = /([0-9]{1,2}):([0-9]{1,2})/;
        const match = msg.text.match(timeRegex);
        
        if (match) {
            logger.info(`Найдено время в сообщении: ${match[0]} от пользователя ${name}`);
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);

            // Проверяем диапазон времени
            if (hours < 16 || hours > 23 || minutes < 0 || minutes > 59) {
                logger.warn(`Некорректное время от ${name}: ${hours}:${minutes}`);
                await this.bot.sendMessage(
                    chatId,
                    '❌ Время должно быть в диапазоне от 16:00 до 23:55'
                );
                return true;
            }

            // Проверяем, что минуты кратны 5
            if (minutes % 5 !== 0) {
                logger.warn(`Некратные 5 минуты от ${name}: ${minutes}`);
                await this.bot.sendMessage(
                    chatId,
                    '❌ Минуты должны быть кратны 5 (например: 16:00, 16:05, 16:10 и т.д.)'
                );
                return true;
            }

            // Форматируем время
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            logger.info(`Сохраняем голос от ${name}: ${timeStr}`);
            
            // Сохраняем голос
            activePoll.votes.set(name, timeStr);

            // Обновляем сообщение с результатами
            const results = this.formatTimePollResults(activePoll);
            try {
                await this.bot.editMessageText(
                    `⏰ *Во сколько играем?*\nСоздал опрос: ${activePoll.creator}\n\n${results}\n\n` +
                    `Чтобы проголосовать, отправьте время в формате ЧЧ:ММ (например, 16:30)\n` +
                    `Доступное время: с 16:00 до 23:55 с интервалом в 5 минут`,
                    {
                        chat_id: chatId,
                        message_id: activePoll.messageId,
                        parse_mode: 'Markdown'
                    }
                );
                logger.info(`Обновлено сообщение с опросом в чате ${chatId}`);
            } catch (error) {
                logger.error(`Ошибка при обновлении сообщения с опросом в чате ${chatId}:`, error);
                // Если не удалось обновить сообщение, отправляем новое
                await this.bot.sendMessage(
                    chatId,
                    `⏰ *Текущие результаты опроса*\nСоздал: ${activePoll.creator}\n\n${results}`,
                    { parse_mode: 'Markdown' }
                );
            }

            await this.bot.sendMessage(
                chatId,
                `✅ Ваш голос учтен: ${timeStr}`,
                { reply_to_message_id: msg.message_id }
            );

            return true;
        }

        logger.debug(`Сообщение не содержит время в формате ЧЧ:ММ: ${msg.text}`);
        return false;
    }

    async handleResults(msg) {
        const chatId = msg.chat.id;
        const activePoll = this.activeTimePolls.get(chatId);

        if (!activePoll) {
            await this.bot.sendMessage(
                chatId,
                '❌ В этом чате нет активного опроса о времени. Создайте новый опрос командой /time'
            );
            return;
        }

        const results = this.formatTimePollResults(activePoll);
        await this.bot.sendMessage(
            chatId,
            `⏰ *Текущие результаты опроса*\nСоздал: ${activePoll.creator}\n\n${results}`,
            { parse_mode: 'Markdown' }
        );
    }

    formatTimePollResults(poll) {
        const votes = poll.votes;
        const votedUsers = new Map(); // время -> [имена]
        const notVoted = [];

        // Получаем все возможные имена
        const allNames = new Set(Object.values(USERNAME_MAPPING));

        // Распределяем голоса
        for (const name of allNames) {
            const vote = votes.get(name);
            if (!vote) {
                notVoted.push(name);
            } else {
                if (!votedUsers.has(vote)) {
                    votedUsers.set(vote, []);
                }
                votedUsers.get(vote).push(name);
            }
        }

        let message = '';

        // Сортируем времена
        const sortedTimes = Array.from(votedUsers.keys()).sort();
        
        // Показываем проголосовавших
        if (sortedTimes.length > 0) {
            message += '*Проголосовали:*\n';
            sortedTimes.forEach(time => {
                const users = votedUsers.get(time);
                message += `🕐 *${time}*: ${users.join(', ')}\n`;
            });
            message += '\n';
        }

        // Показываем не проголосовавших
        if (notVoted.length > 0) {
            message += '*Не проголосовали:*\n';
            notVoted.forEach(name => {
                message += `❓ ${name}\n`;
            });
        }

        return message || 'Пока никто не проголосовал';
    }
}

module.exports = new CommandHandlers(); 