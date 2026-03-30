# DM Guard

Защита личных сообщений для указанных пользователей в Rocket.Chat.

## 📋 Описание

Приложение **DM Firewall** позволяет защитить определённых пользователей от нежелательных личных сообщений (DM). Только участники указанного канала могут создавать личные сообщения с защищёнными пользователями.

---

## 🚀 Установка

### Шаг 1: Установка Node.js

#### Windows

1. Скачайте установщик с официального сайта: [nodejs.org](https://nodejs.org/)
2. Выберите версию **LTS** (Long Term Support)
3. Запустите установщик и следуйте инструкциям
4. Проверьте установку:

```bash
node --version
npm --version
```

#### Linux (Ubuntu/Debian)

```bash
# Установка через NodeSource
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка
node --version
npm --version
```

#### macOS

```bash
# Через Homebrew
brew install node

# Проверка
node --version
npm --version
```

---

### Шаг 2: Установка Rocket.Chat Apps CLI

```bash
npm install -g @rocket.chat/apps-cli
```

Проверьте установку:

```bash
rc-apps --version
```

---

### Шаг 3: Клонирование проекта (если есть исходный код)

```bash
git clone <repository-url>
cd dm-firewall
```

Или распакуйте архив с приложением.

---

### Шаг 4: Установка зависимостей

```bash
npm install
```

---

### Шаг 5: Сборка приложения

```bash
rc-apps package
```

После успешной сборки в папке `dist/` появится файл `dm-firewall_0.0.1.zip`.

---

## 📦 Развёртывание

### Вариант 1: Через админ-панель (рекомендуется)

1. Войдите в Rocket.Chat под администратором
2. Перейдите в **Marketplace** → **Private Apps**
3. Нажмите **Upload private app**
4. Выберите файл `dist/dm-firewall_0.0.1.zip`
5. Нажмите **Install**

---

### Вариант 2: Через CLI

#### Создание конфигурационного файла

Создайте файл `.rcappsconfig` в корне проекта:

```json
{
    "host": "https://your-rocketchat-server.com",
    "username": "admin",
    "password": "your-password"
}
```

⚠️ **Важно:** Добавьте `.rcappsconfig` в `.gitignore`

```gitignore
.rcappsconfig
```

#### Развёртывание

```bash
rc-apps deploy
```

Или с параметрами командной строки:

```bash
rc-apps deploy --url https://your-server.com --username admin --password secret
```

---

## ⚙️ Настройка

После установки приложения:

1. Перейдите в **Marketplace** → **Private Apps**
2. Найдите **DM Firewall** в списке установленных приложений
3. Нажмите на приложение для открытия настроек
4. Заполните настройки:

| Настройка | Описание | Пример |
|-----------|----------|--------|
| **Protected User** | Имя пользователя, которого защищаем | `nik` |
| **Allowed Channel** | Имя канала (без #), участники которого могут писать | `private-team` |

4. Нажмите **Save**

---
