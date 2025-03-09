FROM node:18-alpine

# Создаем директорию приложения
WORKDIR /usr/src/app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Создаем volume для хранения данных подписчиков
VOLUME [ "/usr/src/app/data" ]

# Запускаем приложение
CMD [ "node", "src/bot.js" ] 