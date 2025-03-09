const { google } = require('googleapis');
const fs = require('fs');
const config = require('../config/config');
const logger = require('../utils/logger');

class GoogleSheetsService {
    constructor() {
        this.auth = null;
        this.sheets = null;
        this.initialized = false;
        this.cache = null;
        this.lastFetchTime = null;
    }

    async initialize() {
        try {
            if (!fs.existsSync(config.CREDENTIALS_FILE)) {
                throw new Error(`Файл ${config.CREDENTIALS_FILE} не найден`);
            }

            const credentials = JSON.parse(fs.readFileSync(config.CREDENTIALS_FILE, 'utf8'));
            this.auth = new google.auth.GoogleAuth({
                credentials,
                scopes: [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });

            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.initialized = true;
            logger.info('Google Sheets сервис инициализирован');
        } catch (error) {
            logger.error('Ошибка при инициализации Google Sheets:', error);
            throw error;
        }
    }

    async getData(useCache = true) {
        if (!this.initialized) {
            await this.initialize();
        }

        // Проверяем кэш
        if (useCache && this.cache && this.lastFetchTime && 
            (Date.now() - this.lastFetchTime) < config.CACHE_TIMEOUT) {
            logger.debug('Возвращаем данные из кэша');
            return this.cache;
        }

        try {
            // Оптимизированный запрос - получаем только нужные столбцы
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: 'A:B', // Получаем только столбцы с именами и палками
                valueRenderOption: 'UNFORMATTED_VALUE', // Получаем числа как числа
                majorDimension: 'ROWS' // Получаем данные по строкам
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                throw new Error('Данные не найдены в таблице');
            }

            const headers = rows[0];
            const nameIndex = headers.indexOf('Имя');
            const sticksIndex = headers.indexOf('Кол-во палок');

            if (nameIndex === -1 || sticksIndex === -1) {
                throw new Error('Не найдены обязательные столбцы "Имя" и/или "Кол-во палок"');
            }

            // Оптимизированная обработка данных
            const data = rows.slice(1)
                .map(row => ({
                    'Имя': row[nameIndex] ? String(row[nameIndex]).trim() : '',
                    'Кол-во палок': row[sticksIndex] === undefined || row[sticksIndex] === '' ? 
                        0 : Number(row[sticksIndex]) || 0
                }))
                .filter(item => item['Имя'] !== '');

            // Обновляем кэш
            this.cache = { headers: ['Имя', 'Кол-во палок'], data };
            this.lastFetchTime = Date.now();
            logger.debug(`Получены новые данные из таблицы: ${data.length} строк`);

            return this.cache;
        } catch (error) {
            logger.error('Ошибка при получении данных из Google Sheets:', error);
            if (this.cache) {
                logger.warn('Возвращаем последние известные данные из кэша');
                return this.cache;
            }
            throw error;
        }
    }

    // Метод для принудительного обновления данных с оптимизацией
    async forceUpdate() {
        this.clearCache();
        return await this.getData(false);
    }

    // Метод для очистки кэша
    clearCache() {
        this.cache = null;
        this.lastFetchTime = null;
        logger.debug('Кэш очищен');
    }

    async updateStickCount(name, count) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Получаем текущие данные для поиска строки
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: 'A:B',
                valueRenderOption: 'UNFORMATTED_VALUE'
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                throw new Error('Данные не найдены в таблице');
            }

            // Ищем индекс строки с указанным именем
            const rowIndex = rows.findIndex(row => 
                row[0] && row[0].toString().toLowerCase().trim() === name.toLowerCase().trim()
            );

            if (rowIndex === -1) {
                throw new Error(`Пользователь "${name}" не найден в таблице`);
            }

            // Обновляем значение в найденной ячейке
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: `B${rowIndex + 1}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [[count]]
                }
            }).catch(error => {
                if (error.message.includes('permission')) {
                    throw new Error('Нет прав на редактирование таблицы. Пожалуйста, предоставьте права на редактирование для сервисного аккаунта.');
                }
                throw error;
            });

            // Очищаем кэш после обновления
            this.clearCache();
            logger.info(`Обновлено количество палок для ${name}: ${count}`);
            
            return true;
        } catch (error) {
            logger.error('Ошибка при обновлении количества палок:', error);
            throw error;
        }
    }

    async findUser(name) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: config.GOOGLE_SHEET_ID,
                range: 'A:B',
                valueRenderOption: 'UNFORMATTED_VALUE'
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                return null;
            }

            const userRow = rows.find(row => 
                row[0] && row[0].toString().toLowerCase().trim() === name.toLowerCase().trim()
            );

            if (!userRow) {
                return null;
            }

            return {
                name: userRow[0],
                sticks: parseInt(userRow[1]) || 0
            };
        } catch (error) {
            logger.error('Ошибка при поиске пользователя:', error);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService(); 