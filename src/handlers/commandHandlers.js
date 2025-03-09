const googleSheets = require('../services/googleSheets');
const chartService = require('../services/chartService');
const logger = require('../utils/logger');
const config = require('../config/config');
const path = require('path');
const fs = require('fs');

// Константы для сообщений
const MESSAGES = {
    COMMANDS_LIST: 
        '/chart - столбчатая диаграмма\n' +
        '/stats - текстовая статистика по палочникам\n' +
        '/rules - правила получения и списания палок\n' +
        '/subscribe - подписаться на уведомления об изменениях\n' +
        '/unsubscribe - отписаться от уведомлений об изменениях',
    
    WELCOME: function() {
        return 'Привет! Я бот, который показывает диаграммы из Google таблицы "Палочники".\n\n' +
               'Используйте следующие команды:\n' + this.COMMANDS_LIST;
    },
    
    RULES:
        '📜 *Правила получения и списания палок:*\n\n' +
        '1️⃣ Палку получает тот кто не играл в текущий день\n\n' +
        '2️⃣ При появлении ситуации, где нужно решать играет чел или нет, внимание обращается на палки и в случаи его не участия в игре по причине большего кол-ва палок у него все палки обнуляются на следующий день\n\n' +
        '3️⃣ Расчётное время начисления палок 00:00 по Члб\n\n' +
        '4️⃣ При спорных ситуациях при начислении палок, решают данную ситуацию первых 3 человека у которых меньше всего палок\n\n' +
        '5️⃣ Если из за участника нет возможности играть рейтинговую игру, то путем голосования принимается решение получает он палку или нет\n\n' +
        '6️⃣ Оспорить начисление палки можно в письменной форме в чате, срок рассмотрения составляет одни сутки'
};

class CommandHandlers {
    constructor() {
        this.subscribers = new Set();
        this.lastData = null;
        this.checkInterval = null;
        this.bot = null;
        this.subscribersFile = path.join(process.cwd(), 'subscribers.json');
        this.loadSubscribers();
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
            if (index === 0) emoji = '🥇';
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

    async handleSticks(msg, args) {
        try {
            if (!args || args.length < 2) {
                await this.bot.sendMessage(
                    msg.chat.id,
                    '❗️ Использование команды:\n' +
                    '/sticks <имя> <количество>\n\n' +
                    'Например:\n' +
                    '/sticks Иван 5\n\n' +
                    '📝 Команда изменит количество палок у указанного участника.'
                );
                return;
            }

            const count = parseInt(args[args.length - 1]);
            const name = args.slice(0, -1).join(' ');

            if (isNaN(count) || count < 0) {
                await this.bot.sendMessage(
                    msg.chat.id,
                    '❌ Количество палок должно быть положительным числом'
                );
                return;
            }

            // Проверяем, существует ли пользователь
            const user = await googleSheets.findUser(name);
            if (!user) {
                await this.bot.sendMessage(
                    msg.chat.id,
                    `❌ Пользователь "${name}" не найден в таблице`
                );
                return;
            }

            // Обновляем количество палок
            await googleSheets.updateStickCount(name, count);
            
            // Отправляем подтверждение
            await this.bot.sendMessage(
                msg.chat.id,
                `✅ Обновлено количество палок для ${name}: ${count}`
            );

            // Получаем свежие данные для статистики
            const { data } = await googleSheets.forceUpdate();
            const filteredData = this.filterAndSortData(data);
            
            if (filteredData.length > 0) {
                const message = this.formatStatsMessage(filteredData);
                await this.bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
            }

        } catch (error) {
            logger.error('Ошибка при обновлении палок:', error);
            try {
                if (error.message.includes('permission')) {
                    await this.bot.sendMessage(
                        msg.chat.id,
                        '❌ Ошибка: нет прав на редактирование таблицы'
                    );
                } else {
                    await this.bot.sendMessage(
                        msg.chat.id,
                        `❌ Ошибка при обновлении: ${error.message}`
                    );
                }
            } catch (sendError) {
                logger.error('Ошибка при отправке сообщения об ошибке:', sendError);
            }
        }
    }
}

module.exports = new CommandHandlers(); 