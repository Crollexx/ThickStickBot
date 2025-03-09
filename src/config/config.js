require('dotenv').config();
const path = require('path');

module.exports = {
    // Telegram конфигурация
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    
    // Google Sheets конфигурация
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
    CREDENTIALS_FILE: path.join(__dirname, '../../credentials.json'),
    
    // Настройки мониторинга
    CHECK_INTERVAL: 15 * 1000, // 15 секунд
    CACHE_TIMEOUT: 10 * 1000, // 10 секунд
    
    // Настройки диаграммы
    CHART_COLORS: [
        '#4e79a7', // синий
        '#f28e2c', // оранжевый
        '#e15759', // красный
        '#76b7b2', // бирюзовый
        '#59a14f', // зеленый
        '#edc949', // желтый
        '#af7aa1', // фиолетовый
        '#ff9da7', // розовый
        '#9c755f', // коричневый
        '#bab0ab'  // серый
    ],
    CHART_BACKGROUND_OPACITY: 0.7,
    CHART_GRID_OPACITY: 0.1
}; 