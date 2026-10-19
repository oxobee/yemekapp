#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ ! -d "venv" ]; then
    echo "Sanal ortam oluşturuluyor..."
    python3.12 -m venv venv || python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

export PYTHONPATH="$DIR:$DIR/ui"
export FLASK_SECRET_KEY="${FLASK_SECRET_KEY:-$(openssl rand -hex 24)}"
export AUTH_MODE="local"

echo "=================================================="
echo " YemekApp (Pick-a-Recipe) Başlatılıyor... "
echo " Web Arayüzü: http://localhost:5006"
echo "=================================================="

exec python ui/app.py
