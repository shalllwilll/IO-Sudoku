FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY backend/requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

COPY backend/pyproject.toml ./
COPY backend/app ./app
COPY backend/packs ./packs
RUN pip install --no-cache-dir --no-deps .

ENV DB_PATH=/var/lib/sudoku/sudoku.db SUDOKU_DATA_DIR=/data
VOLUME /var/lib/sudoku
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
