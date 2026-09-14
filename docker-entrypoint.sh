#!/bin/sh
# Siembra el volumen de datos con la base de PRUEBA la primera vez que
# arranca (o si alguien borró la base). Los arranques siguientes respetan
# lo que haya en /app/datos. La semilla puede ir plana o comprimida (.gz).
set -e
mkdir -p /app/datos
if [ ! -f /app/datos/vacaciones-e3.db ]; then
  echo "[vacaciones-e3] Sembrando base de datos de prueba…"
  if [ -f /app/semilla/vacaciones-e3.db ]; then
    cp /app/semilla/vacaciones-e3.db /app/datos/vacaciones-e3.db
  elif [ -f /app/semilla/vacaciones-e3.db.gz ]; then
    gunzip -c /app/semilla/vacaciones-e3.db.gz > /app/datos/vacaciones-e3.db
  fi
fi
exec "$@"
