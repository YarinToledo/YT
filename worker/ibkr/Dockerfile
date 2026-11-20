FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY orb.py worker.py ./
RUN useradd -m worker
USER worker
CMD ["python", "-u", "worker.py"]
