#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Для игры нужен Node.js 22.18 или новее: https://nodejs.org"
  read -r "?Нажмите Enter для выхода."
  exit 1
fi

if [ ! -d node_modules ]; then
  npm ci --cache ./work/npm-cache || exit 1
fi

npm run build || exit 1
(sleep 1; open http://localhost:3000) &
echo "Пока это окно открыто, сервер игры работает. Остановка: Ctrl+C."
npm start
