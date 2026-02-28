-- スキーマ初期化スクリプト
-- DB データディレクトリの初回作成時に PostgreSQL が自動実行する。
-- CREATE TABLE IF NOT EXISTS / DO NOT EXISTS によりべき等（既存データ保護）。

-- ENUM 型の作成（IF NOT EXISTS はPostgreSQL 9.3+で使用可能な DO ブロックで対応）
DO $$ BEGIN
    CREATE TYPE mediatypeenum AS ENUM ('image', 'video');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE tagsourceenum AS ENUM ('user', 'clip');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- media テーブル
CREATE TABLE IF NOT EXISTS media (
    id            SERIAL PRIMARY KEY,
    original_filename VARCHAR NOT NULL,
    minio_key     VARCHAR,
    file_hash     VARCHAR NOT NULL,
    media_type    mediatypeenum NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP,
    clip_status   VARCHAR NOT NULL DEFAULT 'pending',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    error_detail  VARCHAR
);

CREATE INDEX IF NOT EXISTS ix_media_id        ON media (id);
CREATE INDEX IF NOT EXISTS ix_media_file_hash ON media (file_hash);

-- tags テーブル
CREATE TABLE IF NOT EXISTS tags (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tags_id   ON tags (id);
CREATE INDEX IF NOT EXISTS ix_tags_name ON tags (name);

-- media_tags テーブル
CREATE TABLE IF NOT EXISTS media_tags (
    media_id INTEGER NOT NULL REFERENCES media (id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags  (id) ON DELETE CASCADE,
    source   tagsourceenum NOT NULL DEFAULT 'user',
    score    FLOAT,
    PRIMARY KEY (media_id, tag_id)
);
