# MinIO Image API

MinIO・PostgreSQL・FastAPI を使用した画像・動画アップロード API。CLIP による自動タグ付け機能を提供する。

## プロジェクト概要

- **画像・動画アップロード**: MinIO にファイルを保存し、PostgreSQL にメタデータを管理
- **CLIP 自動タグ付け**: アップロード時に画像を自動解析し、関連タグを付与
- **タグ管理**: タグの作成・更新・削除、メディアへの手動タグ付け
- **重複検出**: SHA256 ハッシュで同一ファイルを検出し、MinIO への二重保存を防止
- **論理削除**: メディアは物理削除せず、削除済みフラグで管理

## 必要環境

- Docker
- Docker Compose

## セットアップ

1. 環境変数ファイルを作成する:

```bash
cp .env.example .env
```

2. サービスを起動する:

```bash
docker compose up -d
```

3. API にアクセスする:
   - API: http://localhost:8000
   - MinIO コンソール: http://localhost:9001
   - API ドキュメント: http://localhost:8000/docs

## API エンドポイント一覧

| メソッド | パス | 説明 |
|----------|------|------|
| POST | /media | メディアをアップロードする |
| GET | /media | メディア一覧を取得する |
| GET | /media/{id} | メディアを ID で取得する |
| GET | /media/{id}/file | メディアファイルをダウンロードする |
| DELETE | /media/{id} | メディアを論理削除する |
| POST | /media/{id}/analyze | メディアを CLIP 解析する |
| GET | /tags | タグ一覧を取得する |
| POST | /tags | タグを作成する |
| PATCH | /tags/{id} | タグ名を更新する |
| DELETE | /tags/{id} | タグを削除する |
| POST | /media/{id}/tags | メディアにタグを追加する |
| DELETE | /media/{id}/tags/{tag_id} | メディアからタグを削除する |
| POST | /clip/analyze | 画像を CLIP 解析する（保存なし）|

## curl コマンド例

### 画像のアップロード

```bash
curl -X POST http://localhost:8000/media \
  -F "file=@photo.jpg" \
  -F "tags=cat" \
  -F "tags=outdoor"
```

### メディア一覧の取得

```bash
curl "http://localhost:8000/media?tag=cat&media_type=image&limit=10"
```

### メディアの取得

```bash
curl http://localhost:8000/media/1
```

### ファイルのダウンロード

```bash
curl http://localhost:8000/media/1/file -o output.jpg
```

### メディアの削除

```bash
curl -X DELETE http://localhost:8000/media/1
```

### CLIP 解析の実行

```bash
curl -X POST http://localhost:8000/media/1/analyze
```

### タグ一覧の取得

```bash
curl http://localhost:8000/tags
```

### タグの作成

```bash
curl -X POST http://localhost:8000/tags \
  -H "Content-Type: application/json" \
  -d '{"name": "nature"}'
```

### タグ名の更新

```bash
curl -X PATCH http://localhost:8000/tags/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "landscape"}'
```

### タグの削除

```bash
curl -X DELETE http://localhost:8000/tags/1
```

### メディアへのタグ追加

```bash
curl -X POST http://localhost:8000/media/1/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "portrait"}'
```

### メディアからのタグ削除

```bash
curl -X DELETE http://localhost:8000/media/1/tags/2
```

### CLIP 解析のみ実行（保存なし）

```bash
curl -X POST http://localhost:8000/clip/analyze \
  -F "file=@photo.jpg"
```

## テストの実行

### pytest（バックエンド単体テスト）

1. テスト用環境変数ファイルを作成する:

```bash
cp .env.test.example .env.test
# .env.test を編集して各変数に値を設定する
```

2. テストを実行する:

```bash
docker compose --env-file .env.test -f docker-compose.test.yml run --rm api-test
docker compose --env-file .env.test -f docker-compose.test.yml down -v
```

### E2E テスト（Playwright）

```bash
docker compose --env-file .env.test -f docker-compose.test.yml up -d --build api-server-test frontend-e2e clip-worker-e2e
cd frontend && PW_BASE_URL=http://localhost:3001 npx playwright test
docker compose --env-file .env.test -f docker-compose.test.yml down -v
```

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  FastAPI     │  │   MinIO      │  │  PostgreSQL  │  │
│  │  :8000       │──│   :9000      │  │  :5432       │  │
│  │              │  │   :9001      │  │              │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │                                               │
│  ┌──────┴────────────────────────────────────────────┐  │
│  │  app/                                             │  │
│  │  ├── main.py        (アプリケーション起動)        │  │
│  │  ├── config.py      (設定管理)                   │  │
│  │  ├── database.py    (DB 接続)                    │  │
│  │  ├── models.py      (SQLAlchemy モデル)          │  │
│  │  ├── schemas.py     (Pydantic スキーマ)          │  │
│  │  ├── crud.py        (CRUD 操作)                  │  │
│  │  ├── validators.py  (バリデーション)             │  │
│  │  ├── routers/       (エンドポイント)             │  │
│  │  └── services/      (外部サービス連携)           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```
