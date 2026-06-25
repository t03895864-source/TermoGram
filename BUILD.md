# TERMOGRAM - Сборка приложений

## 🖥️ .EXE для Windows

### Быстрая сборка:
```powershell
cd C:\Users\Timur\.koda\tg-clone
npm run build:exe
```

**Готовый файл:** `dist\TERMOGRAM Setup 1.0.0.exe`

### Если ошибка с sqlite3:
1. Закрой все процессы Node.js
2. Перезагрузи компьютер
3. Запусти снова: `npm run build:exe`

---

## 📱 .APK для Android

### Способ 1: PWABuilder (БЫСТРО - 2 минуты) ⭐

1. **Запусти TERMOGRAM:**
   ```powershell
   npm start
   ```

2. **Запусти ngrok:**
   ```powershell
   ngrok.exe http 3000
   ```

3. **Скопируй ссылку** (например: `https://xxxx.ngrok.io`)

4. **Иди на https://pwabuilder.com**

5. **Вставь ссылку** → Analyze → Build for Android

6. **Скачай APK** и установи на телефон!

### Способ 2: Capacitor (для продвинутых)

```powershell
# Установи
npm install @capacitor/core @capacitor/cli @capacitor/android

# Настрой
npx cap init TERMOGRAM com.termogram.app

# Отредактируй capacitor.config.json:
# "server": { "url": "https://твоя-ссылка-ngrok.io" }

# Собери
npx cap add android
npx cap sync
npx cap open android
```

В Android Studio: Build → Build APK

---

## 🚀 Публикация

### .EXE:
- Отправь файл друзьям
- Загрузи на GitHub Releases
- Опубликуй на itch.io

### .APK:
- Отправь файл друзьям
- Загрузи на Google Play (нужен аккаунт разработчика $25)
- Опубликуй на 4PDA

---

## ⚠️ Важно

1. **Для .APK нужен внешний сервер** (ngrok или хостинг)
2. **Для .EXE сервер встроен** в приложение
3. **ngrok меняет ссылку** при каждом запуске (бесплатно)

