# TERMOGRAM

Мессенджер в стиле Telegram с современным интерфейсом.

## ✨ Функции

- ✅ Регистрация/вход по username
- ✅ Чаты в реальном времени
- ✅ Поиск пользователей по @username
- ✅ Аудио/видео звонки (WebRTC)
- ✅ Профиль: имя, фото, о себе, телефон
- ✅ Статусы online / last seen
- ✅ Вкладки внизу (как в Telegram)
- ✅ PWA (установка как приложение)
- ✅ .exe для Windows
- ✅ .apk для Android

## 🚀 Быстрый старт

```powershell
cd C:\Users\Timur\.koda\tg-clone
npm start
```

Открой: **http://localhost:3000**

---

## 📱 Вкладки

### 💬 Чаты
- Список всех чатов
- Поиск по @username
- Сообщения в реальном времени

### 👤 Профиль
- Твоё фото (можно менять)
- Имя
- Username (нельзя менять)
- О себе (до 140 символов)
- Телефон

---

## 📞 Звонки

1. Открой чат с пользователем
2. Нажми **"📞 Позвонить"**
3. Включи камеру кнопкой **"📷 Камера"**
4. Микрофон включается/выключается кнопкой **"🎙️ Микро"**

---

## 🌐 Как дать доступ друзьям

### Вариант 1: ngrok (из любой точки мира)
```powershell
# 1. Скачай: https://ngrok.com/download
# 2. Зарегистрируйся и получи токен
# 3. Запусти TERMOGRAM: npm start
# 4. В новом окне: ngrok.exe http 3000
# 5. Скопируй ссылку https://....ngrok.io и отправь друзьям!
```

### Вариант 2: Локальная сеть (Wi-Fi)
- Сервер покажет твой IP: `http://192.168.x.x:3000`
- Друзья должны быть в той же сети

---

## 🖥️ .EXE для Windows

```powershell
# Установи Electron
npm install electron electron-builder --save-dev

# Протестируй
npx electron .

# Собери .exe
npx electron-builder --win
```

Файл будет в: `dist\TERMOGRAM Setup 1.0.0.exe`

---

## 📱 .APK для Android

### Быстрый способ (WebAPK):
1. Открой https://pwabuilder.com
2. Вставь ссылку на свой TERMOGRAM (через ngrok)
3. Скачай готовый APK!

### Продвинутый способ (Capacitor):
Смотри **BUILD.md**

---

## 📦 PWA (установка из браузера)

### Chrome / Edge:
1. Открой http://localhost:3000
2. Нажми **три точки** → **"Установить TERMOGRAM"**
3. Приложение откроется в отдельном окне!

### Телефон (Android):
1. Открой ссылку в Chrome
2. Три точки → **"Установить приложение"** или **"На главный экран"**

### iPhone:
1. Открой в Safari
2. Кнопка "Поделиться" → **"На экран «Домой»"**

---

## 🛠️ Технологии

- **Backend:** Node.js + Express + Socket.IO
- **Database:** SQLite
- **Frontend:** Vanilla JS
- **Calls:** WebRTC (STUN Google)
- **Desktop:** Electron
- **Mobile:** Capacitor / PWA

---

## ⚠️ Важно

Это demo-проект:
- Нет end-to-end шифрования
- Нет групповых чатов
- Нет пересылки файлов
- SQLite для локального использования

Для production нужно добавить:
- HTTPS
- PostgreSQL / MongoDB
- Redis для сессий
- S3 для файлов
- Group chats
- E2E шифрование
