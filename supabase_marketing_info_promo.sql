-- ============================================================
-- JASA SURUH - Marketing Content Table (Info & Promo)
-- Safe to run multiple times (idempotent)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Main table for Info & Promo
CREATE TABLE IF NOT EXISTS marketing_contents (
    id TEXT PRIMARY KEY DEFAULT ('mkt_' || replace(gen_random_uuid()::text, '-', '')),
    content_type TEXT NOT NULL CHECK (content_type IN ('promo', 'info')),
    badge TEXT NOT NULL DEFAULT 'INFO',
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '✨',
    date_text TEXT,
    link_url TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    legacy_id TEXT,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Compatibility ALTERs in case table was created manually with fewer columns
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS badge TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS date_text TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS is_active BOOLEAN;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS legacy_id TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS meta JSONB;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE marketing_contents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE marketing_contents SET content_type = COALESCE(NULLIF(content_type, ''), 'info');
UPDATE marketing_contents SET badge = COALESCE(NULLIF(badge, ''), CASE WHEN content_type = 'promo' THEN 'PROMO' ELSE 'INFO' END);
UPDATE marketing_contents SET title = COALESCE(NULLIF(title, ''), 'Info Jasa Suruh');
UPDATE marketing_contents SET description = COALESCE(description, '');
UPDATE marketing_contents SET image_url = COALESCE(image_url, '');
UPDATE marketing_contents SET emoji = COALESCE(NULLIF(emoji, ''), CASE WHEN content_type = 'promo' THEN '✨' ELSE '📰' END);
UPDATE marketing_contents SET link_url = COALESCE(link_url, '');
UPDATE marketing_contents SET sort_order = COALESCE(sort_order, 0);
UPDATE marketing_contents SET is_active = COALESCE(is_active, true);
UPDATE marketing_contents SET meta = COALESCE(meta, '{}'::jsonb);
UPDATE marketing_contents SET created_at = COALESCE(created_at, now());
UPDATE marketing_contents SET updated_at = COALESCE(updated_at, now());

ALTER TABLE marketing_contents ALTER COLUMN content_type SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN content_type SET DEFAULT 'info';
ALTER TABLE marketing_contents ALTER COLUMN badge SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN badge SET DEFAULT 'INFO';
ALTER TABLE marketing_contents ALTER COLUMN title SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN description SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN description SET DEFAULT '';
ALTER TABLE marketing_contents ALTER COLUMN image_url SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN image_url SET DEFAULT '';
ALTER TABLE marketing_contents ALTER COLUMN emoji SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN emoji SET DEFAULT '✨';
ALTER TABLE marketing_contents ALTER COLUMN link_url SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN link_url SET DEFAULT '';
ALTER TABLE marketing_contents ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE marketing_contents ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE marketing_contents ALTER COLUMN meta SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN meta SET DEFAULT '{}'::jsonb;
ALTER TABLE marketing_contents ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE marketing_contents ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE marketing_contents ALTER COLUMN updated_at SET DEFAULT now();

-- Recreate the content type check safely
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'marketing_contents_content_type_check'
          AND conrelid = 'marketing_contents'::regclass
    ) THEN
        ALTER TABLE marketing_contents DROP CONSTRAINT marketing_contents_content_type_check;
    END IF;
END $$;

ALTER TABLE marketing_contents
ADD CONSTRAINT marketing_contents_content_type_check
CHECK (content_type IN ('promo', 'info'));

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_marketing_contents_type_active_sort
    ON marketing_contents(content_type, is_active, sort_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_contents_created_at
    ON marketing_contents(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_contents_legacy
    ON marketing_contents(content_type, legacy_id)
    WHERE legacy_id IS NOT NULL;

-- 4) Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION set_marketing_contents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketing_contents_updated_at ON marketing_contents;
CREATE TRIGGER trg_marketing_contents_updated_at
BEFORE UPDATE ON marketing_contents
FOR EACH ROW
EXECUTE FUNCTION set_marketing_contents_updated_at();

-- 5) RLS policy (align with current project style)
ALTER TABLE marketing_contents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_marketing_contents" ON marketing_contents;
CREATE POLICY "anon_all_marketing_contents"
ON marketing_contents
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- 6) Optional backfill from old settings JSONB keys
--    Source keys: settings(key='config').data.home_promos and data.home_news
DO $$
DECLARE
    cfg JSONB;
BEGIN
    SELECT data INTO cfg
    FROM settings
    WHERE key = 'config'
    LIMIT 1;

    IF cfg IS NOT NULL THEN
        -- Promo backfill
        INSERT INTO marketing_contents (
            content_type,
            badge,
            title,
            description,
            image_url,
            emoji,
            date_text,
            link_url,
            sort_order,
            is_active,
            legacy_id,
            meta
        )
        SELECT
            'promo'::TEXT,
            COALESCE(NULLIF(trim(item.value->>'badge'), ''), 'PROMO') AS badge,
            COALESCE(NULLIF(trim(item.value->>'title'), ''), 'Promo Jasa Suruh') AS title,
            COALESCE(NULLIF(trim(item.value->>'description'), ''), '-') AS description,
            COALESCE(NULLIF(trim(item.value->>'imageUrl'), ''), COALESCE(item.value->>'image', '')) AS image_url,
            COALESCE(NULLIF(trim(item.value->>'emoji'), ''), '✨') AS emoji,
            COALESCE(NULLIF(trim(item.value->>'dateText'), ''), NULLIF(trim(item.value->>'date'), '')) AS date_text,
            COALESCE(NULLIF(trim(item.value->>'linkUrl'), ''), COALESCE(item.value->>'link', '')) AS link_url,
            COALESCE(item.ordinality, 1)::INT AS sort_order,
            true AS is_active,
            NULLIF(trim(item.value->>'id'), '') AS legacy_id,
            item.value AS meta
        FROM jsonb_array_elements(COALESCE(cfg->'home_promos', '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
        WHERE NOT EXISTS (
            SELECT 1
            FROM marketing_contents m
            WHERE m.content_type = 'promo'
              AND m.legacy_id IS NOT NULL
              AND m.legacy_id = NULLIF(trim(item.value->>'id'), '')
        );

        -- Info backfill
        INSERT INTO marketing_contents (
            content_type,
            badge,
            title,
            description,
            image_url,
            emoji,
            date_text,
            link_url,
            sort_order,
            is_active,
            legacy_id,
            meta
        )
        SELECT
            'info'::TEXT,
            COALESCE(NULLIF(trim(item.value->>'badge'), ''), 'INFO') AS badge,
            COALESCE(NULLIF(trim(item.value->>'title'), ''), 'Info Jasa Suruh') AS title,
            COALESCE(NULLIF(trim(item.value->>'description'), ''), '-') AS description,
            COALESCE(NULLIF(trim(item.value->>'imageUrl'), ''), COALESCE(item.value->>'image', '')) AS image_url,
            COALESCE(NULLIF(trim(item.value->>'emoji'), ''), '📰') AS emoji,
            COALESCE(NULLIF(trim(item.value->>'dateText'), ''), NULLIF(trim(item.value->>'date'), '')) AS date_text,
            COALESCE(NULLIF(trim(item.value->>'linkUrl'), ''), COALESCE(item.value->>'link', '')) AS link_url,
            COALESCE(item.ordinality, 1)::INT AS sort_order,
            true AS is_active,
            NULLIF(trim(item.value->>'id'), '') AS legacy_id,
            item.value AS meta
        FROM jsonb_array_elements(COALESCE(cfg->'home_news', '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
        WHERE NOT EXISTS (
            SELECT 1
            FROM marketing_contents m
            WHERE m.content_type = 'info'
              AND m.legacy_id IS NOT NULL
              AND m.legacy_id = NULLIF(trim(item.value->>'id'), '')
        );
    END IF;
END $$;

-- 7) Helper view for active content by type
CREATE OR REPLACE VIEW marketing_contents_active AS
SELECT
    id,
    content_type,
    badge,
    title,
    description,
    image_url,
    emoji,
    date_text,
    link_url,
    sort_order,
    meta,
    created_at,
    updated_at
FROM marketing_contents
WHERE is_active = true
ORDER BY content_type ASC, sort_order ASC, created_at DESC;
