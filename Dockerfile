# Редактор целиком в одном образе: docker compose up --build, затем http://localhost:8000

FROM node:22-slim AS frontend
WORKDIR /build
COPY transport_planning_frontend/package.json transport_planning_frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY transport_planning_frontend/ ./
RUN npm run build-only

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_DEBUG=0 \
    DJANGO_ALLOWED_HOSTS=* \
    DJANGO_DATA_DIR=/data \
    DJANGO_FRONTEND_DIST=/app/frontend_dist

# SUMO нужен только кнопке предпроверки и занимает сотни мегабайт:
# без него образ собирается быстрее, docker compose build --build-arg WITH_SUMO=0
ARG WITH_SUMO=1
WORKDIR /app
COPY req.txt ./
RUN pip install --no-cache-dir -r req.txt gunicorn==23.0.0 \
    && if [ "$WITH_SUMO" = "1" ]; then pip install --no-cache-dir eclipse-sumo; fi
COPY transport_planning/ ./
COPY --from=frontend /build/dist ./frontend_dist
RUN mkdir -p /data

EXPOSE 8000
VOLUME ["/data"]
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn transport_planning.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 320"]
