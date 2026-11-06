-- 多账本记账应用 · 数据模型 (design.md §4.2 - §4.5)
--
-- 执行方式：云端数据库管理工具，mode=migrate，每条语句单独执行。
-- 应用代码绝不执行 DDL；本文件只作为可复现的迁移脚本归档。
--
-- 与设计文档的差异（有意加固）：
--   1. validate_txn_accounts() 使用 SECURITY INVOKER 而非 SECURITY DEFINER。
--      SECURITY DEFINER 会绕过 RLS，使调用方可借账户 ID 探测他人账户归属/余额。
--      本环境 RLS 已能正确过滤，INVOKER 下校验同样生效且更安全。
--   2. 触发器额外校验 category_id 的账本归属（文档 §4.4 提到「同理可扩展」）。
--   3. 内置分类模板以 owner_id = '__system__' 落库，模板读策略加了 owner 限定，
--      避免普通用户伪造可被所有人读取的 book_id IS NULL 行。
--   4. RLS 策略显式 TO authenticated, anon，并按官方管理规范补了表级 GRANT，
--      否则会表现为形似策略失效的 42501。

-- ---------------------------------------------------------------- 表

CREATE TABLE books (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id      TEXT NOT NULL DEFAULT auth.uid(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'personal'
                CHECK (type IN ('personal','family','business','travel','other')),
  base_currency TEXT NOT NULL DEFAULT 'CNY',
  icon          TEXT,
  color         TEXT,
  sort_order    INT  NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id              TEXT NOT NULL DEFAULT auth.uid(),
  book_id               BIGINT NOT NULL REFERENCES books(id),
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN
                        ('cash','debit_card','credit_card','ewallet',
                         'investment','receivable','liability')),
  initial_balance_cents BIGINT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'CNY',
  include_in_total      BOOLEAN NOT NULL DEFAULT true,
  credit_limit_cents    BIGINT,
  icon                  TEXT,
  color                 TEXT,
  sort_order            INT NOT NULL DEFAULT 0,
  archived_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    TEXT NOT NULL DEFAULT auth.uid(),
  book_id     BIGINT REFERENCES books(id),   -- NULL = 系统内置模板
  parent_id   BIGINT REFERENCES categories(id),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
  icon        TEXT,
  color       TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id            TEXT NOT NULL DEFAULT auth.uid(),
  book_id             BIGINT NOT NULL REFERENCES books(id),
  account_id          BIGINT NOT NULL REFERENCES accounts(id),
  counter_account_id  BIGINT REFERENCES accounts(id),
  category_id         BIGINT REFERENCES categories(id),
  type                TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  fee_cents           BIGINT NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  currency            TEXT NOT NULL DEFAULT 'CNY',
  occurred_at         TIMESTAMPTZ NOT NULL,
  note                TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  attachment_urls     TEXT[] NOT NULL DEFAULT '{}',
  client_token        TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 核心约束：普通收支恰好 1 个账户且无手续费，转账恰好 2 个不同账户
  CONSTRAINT ck_txn_accounts CHECK (
    (type IN ('expense','income')
       AND counter_account_id IS NULL
       AND fee_cents = 0)
    OR
    (type = 'transfer'
       AND counter_account_id IS NOT NULL
       AND counter_account_id <> account_id)
  )
);

-- ---------------------------------------------------------------- 索引 (§4.3)

CREATE UNIQUE INDEX uq_accounts_name_active
  ON accounts(book_id, name) WHERE archived_at IS NULL;
CREATE INDEX idx_accounts_book
  ON accounts(book_id, sort_order) WHERE archived_at IS NULL;
CREATE INDEX idx_categories_book ON categories(book_id, kind, sort_order);
CREATE UNIQUE INDEX uq_txn_client_token
  ON transactions(owner_id, client_token) WHERE client_token IS NOT NULL;
CREATE INDEX idx_txn_book_time
  ON transactions(book_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_account_time
  ON transactions(account_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_txn_counter_time
  ON transactions(counter_account_id, occurred_at DESC)
  WHERE counter_account_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_txn_category
  ON transactions(category_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------- 触发器 (§4.4)

CREATE OR REPLACE FUNCTION validate_txn_accounts() RETURNS TRIGGER AS $$
DECLARE
  v_book     BIGINT;
  v_cat_book BIGINT;
BEGIN
  SELECT book_id INTO v_book FROM accounts WHERE id = NEW.account_id;
  IF v_book IS DISTINCT FROM NEW.book_id THEN
    RAISE EXCEPTION 'account_id % does not belong to book %', NEW.account_id, NEW.book_id;
  END IF;

  IF NEW.counter_account_id IS NOT NULL THEN
    SELECT book_id INTO v_book FROM accounts WHERE id = NEW.counter_account_id;
    IF v_book IS DISTINCT FROM NEW.book_id THEN
      RAISE EXCEPTION 'counter_account_id % does not belong to book %',
        NEW.counter_account_id, NEW.book_id;
    END IF;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT book_id INTO v_cat_book FROM categories WHERE id = NEW.category_id;
    IF v_cat_book IS NOT NULL AND v_cat_book <> NEW.book_id THEN
      RAISE EXCEPTION 'category_id % does not belong to book %', NEW.category_id, NEW.book_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE TRIGGER trg_txn_accounts
BEFORE INSERT OR UPDATE OF book_id, account_id, counter_account_id, category_id
ON transactions FOR EACH ROW EXECUTE FUNCTION validate_txn_accounts();

-- ---------------------------------------------------------------- RLS (§4.5)
-- 两道门：表级 GRANT + 行级 POLICY，缺一不可。

ALTER TABLE books         ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions  ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.books        TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.accounts      TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories    TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.transactions TO authenticated, anon;

DROP POLICY IF EXISTS books_owner ON books;
DROP POLICY IF EXISTS accounts_owner ON accounts;
DROP POLICY IF EXISTS categories_owner ON categories;
DROP POLICY IF EXISTS categories_read_template ON categories;
DROP POLICY IF EXISTS transactions_owner ON transactions;

CREATE POLICY books_owner ON books FOR ALL TO authenticated, anon
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY accounts_owner ON accounts FOR ALL TO authenticated, anon
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY categories_owner ON categories FOR ALL TO authenticated, anon
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY categories_read_template ON categories FOR SELECT TO authenticated, anon
  USING (book_id IS NULL AND owner_id = '__system__');
CREATE POLICY transactions_owner ON transactions FOR ALL TO authenticated, anon
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
