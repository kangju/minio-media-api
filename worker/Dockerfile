FROM python:3.11-slim

WORKDIR /worker

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# CLIP モデルをビルド時にダウンロードしてキャッシュに保存する。
# コンテナ起動後のインターネットダウンロードを排除し、
# model_test_cache volume 経由で即座に利用可能にする。
RUN python3 -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')"

COPY . .

CMD ["python", "worker.py"]
