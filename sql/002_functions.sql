-- 多账本记账应用 · RPC 函数 (design.md §5.3 / §5.4 / §6.1)
--
-- P0 地基阶段：account_balance / book_balance_snapshot / book_monthly_summary。
-- P0 记账主链路阶段补：init_book_template / archive_book / restore_book。
-- P0 明细与报表阶段补：category_breakdown / daily_trend。
-- 剩余 P1：create_transaction（可选，触发器与 client_token 唯一索引已兜住一致性）。
--
-- 全部使用 SECURITY INVOKER（而非设计文档写的 SECURITY DEFINER）：
-- 聚合函数只需读当前用户自己的行，RLS 正好是所需边界；DEFINER 会绕过 RLS，
-- 导致 account_balance(别人的账户 ID) 泄露余额。前端通过 cloud.database.rpc() 调用。

-- ---------------------------------------------------------------- 单账户余额
-- 余额 = 期初 + 收入 - 支出 - 转出(含手续费) + 转入；忽略软删除与未来时间。
CREATE OR REPLACE FUNCTION account_balance(
  p_account_id BIGINT,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS BIGINT
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT (
    a.initial_balance_cents + COALESCE((
      SELECT SUM(CASE
        WHEN t.type = 'income'   AND t.account_id = a.id THEN  t.amount_cents
        WHEN t.type = 'expense'  AND t.account_id = a.id THEN -t.amount_cents
        WHEN t.type = 'transfer' AND t.account_id = a.id
                                                  THEN -(t.amount_cents + t.fee_cents)
        WHEN t.type = 'transfer' AND t.counter_account_id = a.id
                                                  THEN  t.amount_cents
        ELSE 0 END)
      FROM transactions t
      WHERE t.deleted_at IS NULL
        AND t.occurred_at <= p_as_of
        AND (t.account_id = a.id OR t.counter_account_id = a.id)
    ), 0)
  )::BIGINT
  FROM accounts a
  WHERE a.id = p_account_id
$$;

-- ---------------------------------------------------------------- 账本余额快照
-- 一次扫描流水得出全部账户余额，避免逐账户调用 account_balance 的 N+1。
CREATE OR REPLACE FUNCTION book_balance_snapshot(
  p_book_id BIGINT,
  p_as_of TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  account_id BIGINT,
  account_name TEXT,
  account_type TEXT,
  currency TEXT,
  include_in_total BOOLEAN,
  initial_balance_cents BIGINT,
  balance_cents BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH flows AS (
    SELECT t.account_id AS aid,
           CASE t.type
             WHEN 'income'   THEN  t.amount_cents
             WHEN 'expense'  THEN -t.amount_cents
             WHEN 'transfer' THEN -(t.amount_cents + t.fee_cents)
           END AS delta_cents
    FROM transactions t
    WHERE t.book_id = p_book_id
      AND t.deleted_at IS NULL
      AND t.occurred_at <= p_as_of
    UNION ALL
    SELECT t.counter_account_id AS aid,
           t.amount_cents AS delta_cents
    FROM transactions t
    WHERE t.book_id = p_book_id
      AND t.deleted_at IS NULL
      AND t.occurred_at <= p_as_of
      AND t.type = 'transfer'
      AND t.counter_account_id IS NOT NULL
  ), agg AS (
    SELECT flows.aid AS aid, SUM(flows.delta_cents) AS delta_cents
    FROM flows
    GROUP BY flows.aid
  )
  SELECT a.id                 AS account_id,
         a.name               AS account_name,
         a.type               AS account_type,
         a.currency           AS currency,
         a.include_in_total   AS include_in_total,
         a.initial_balance_cents AS initial_balance_cents,
         (a.initial_balance_cents + COALESCE(agg.delta_cents, 0))::BIGINT AS balance_cents
  FROM accounts a
  LEFT JOIN agg ON agg.aid = a.id
  WHERE a.book_id = p_book_id
    AND a.archived_at IS NULL
  ORDER BY a.sort_order, a.id
$$;

-- ---------------------------------------------------------------- 月度收支汇总
-- 口径：收入/支出只统计 income/expense；transfer 单独统计且不计入净结余。
-- 月份边界按数据库时区，p_month 形如 '2026-11'（V1 单币种、单时区）。
CREATE OR REPLACE FUNCTION book_monthly_summary(
  p_book_id BIGINT,
  p_month TEXT DEFAULT to_char(now(), 'YYYY-MM')
) RETURNS TABLE (
  month TEXT,
  income_cents BIGINT,
  expense_cents BIGINT,
  net_cents BIGINT,
  transfer_cents BIGINT,
  txn_count BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH bounds AS (
    SELECT (p_month || '-01')::date::timestamptz AS from_ts,
           ((p_month || '-01')::date + INTERVAL '1 month')::timestamptz AS to_ts
  )
  SELECT p_month AS month,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'income'), 0)::BIGINT AS income_cents,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'expense'), 0)::BIGINT AS expense_cents,
         (COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'income'), 0)
          - COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'expense'), 0))::BIGINT AS net_cents,
         COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'transfer'), 0)::BIGINT AS transfer_cents,
         COUNT(*)::BIGINT AS txn_count
  FROM transactions t
  CROSS JOIN bounds b
  WHERE t.book_id = p_book_id
    AND t.deleted_at IS NULL
    AND t.occurred_at >= b.from_ts
    AND t.occurred_at < b.to_ts
$$;

-- ---------------------------------------------------------------- 账本模板初始化
-- design.md §4.7：新建账本时在单事务内建一套默认账户（分类只读引用内置模板，不复制行）。
-- 幂等：已有未归档账户时返回 0，重复调用不会造出两套同名账户。
-- SECURITY INVOKER：函数内 INSERT 走调用者 RLS，owner_id 由 DEFAULT auth.uid() 填充；
-- 别人传入你的 book_id 时 RLS 让它看不到，直接报「账本不存在或已归档」，不泄露数据。
CREATE OR REPLACE FUNCTION init_book_template(p_book_id BIGINT)
RETURNS TABLE (created_accounts INT)
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE v_created INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM books b WHERE b.id = p_book_id AND b.archived_at IS NULL) THEN
    RAISE EXCEPTION '账本不存在或已归档';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts a WHERE a.book_id = p_book_id AND a.archived_at IS NULL) THEN
    INSERT INTO accounts (book_id, name, type, initial_balance_cents, currency, include_in_total, sort_order, icon)
    VALUES
      (p_book_id, '现金',     'cash',       0, 'CNY', true, 10, 'wallet'),
      (p_book_id, '储蓄卡',   'debit_card', 0, 'CNY', true, 20, 'credit-card'),
      (p_book_id, '微信钱包', 'ewallet',    0, 'CNY', true, 30, 'message-circle'),
      (p_book_id, '支付宝',   'ewallet',    0, 'CNY', true, 40, 'smartphone');
    GET DIAGNOSTICS v_created = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT v_created;
END;
$$;

-- ---------------------------------------------------------------- 账本归档
-- design.md §5.6：账本软删除时账户与自定义分类一并归档，不做物理删除。
-- transactions 没有 archived_at 字段：流水保留，随账本整体隐藏。前端所有列表、
-- 余额与报表的入口都是「未归档的当前账本」，归档账本的数据不会串到其它账本。
CREATE OR REPLACE FUNCTION archive_book(p_book_id BIGINT)
RETURNS TABLE (archived_accounts INT, archived_categories INT)
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE v_acc INT := 0; v_cat INT := 0;
BEGIN
  UPDATE books SET archived_at = now(), updated_at = now()
   WHERE id = p_book_id AND archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '账本不存在或已归档'; END IF;

  UPDATE accounts SET archived_at = now() WHERE book_id = p_book_id AND archived_at IS NULL;
  GET DIAGNOSTICS v_acc = ROW_COUNT;
  UPDATE categories SET archived_at = now() WHERE book_id = p_book_id AND archived_at IS NULL;
  GET DIAGNOSTICS v_cat = ROW_COUNT;
  RETURN QUERY SELECT v_acc, v_cat;
END;
$$;

-- ---------------------------------------------------------------- 账本恢复
-- 与 archive_book 对称，用于归档内容管理（design.md §7.1「我的」）。
CREATE OR REPLACE FUNCTION restore_book(p_book_id BIGINT)
RETURNS TABLE (restored_accounts INT, restored_categories INT)
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE v_acc INT := 0; v_cat INT := 0;
BEGIN
  UPDATE books SET archived_at = NULL, updated_at = now()
   WHERE id = p_book_id AND archived_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION '账本不存在或未被归档'; END IF;

  UPDATE accounts SET archived_at = NULL WHERE book_id = p_book_id AND archived_at IS NOT NULL;
  GET DIAGNOSTICS v_acc = ROW_COUNT;
  UPDATE categories SET archived_at = NULL WHERE book_id = p_book_id AND archived_at IS NOT NULL;
  GET DIAGNOSTICS v_cat = ROW_COUNT;
  RETURN QUERY SELECT v_acc, v_cat;
END;
$$;

-- ---------------------------------------------------------------- 分类占比
-- design.md §5.4：只统计 income/expense（转账不计入，避免虚增收支）；
-- 未分类（category_id IS NULL）与分类已不可见的统一归并为哨兵 0 /「其他」。
-- p_kind 由前端传 'expense' 或 'income'；WHERE 里的 IN 兜住误传 transfer 的情况。
-- 时间边界按数据库时区（PRC），与 book_monthly_summary 的 date::timestamptz 口径一致。
CREATE OR REPLACE FUNCTION category_breakdown(
  p_book_id BIGINT,
  p_from TEXT,
  p_to TEXT,
  p_kind TEXT DEFAULT 'expense'
) RETURNS TABLE (
  category_id BIGINT,
  category_name TEXT,
  total_cents BIGINT,
  txn_count BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH bounds AS (
    SELECT p_from::date::timestamptz AS from_ts,
           (p_to::date + 1)::timestamptz AS to_ts
  )
  SELECT CASE WHEN t.category_id IS NULL THEN 0 ELSE t.category_id END AS category_id,
         COALESCE(MAX(c.name), '其他') AS category_name,
         SUM(t.amount_cents)::BIGINT AS total_cents,
         COUNT(*)::BIGINT AS txn_count
  FROM transactions t
  CROSS JOIN bounds b
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE t.book_id = p_book_id
    AND t.deleted_at IS NULL
    AND t.type = p_kind
    AND t.type IN ('expense', 'income')
    AND t.occurred_at >= b.from_ts
    AND t.occurred_at < b.to_ts
  GROUP BY CASE WHEN t.category_id IS NULL THEN 0 ELSE t.category_id END
  ORDER BY total_cents DESC
$$;

-- ---------------------------------------------------------------- 每日收支趋势
-- generate_series 补齐没有流水的日期，图表 X 轴连续；LEAST 把跨度限制在 367 天内，
-- 避免误传超大区间生成海量行。转账不计入，软删除过滤。
CREATE OR REPLACE FUNCTION daily_trend(
  p_book_id BIGINT,
  p_from TEXT,
  p_to TEXT
) RETURNS TABLE (
  day TEXT,
  income_cents BIGINT,
  expense_cents BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  WITH bounds AS (
    SELECT p_from::date AS d_from,
           LEAST(p_to::date, p_from::date + 366) AS d_to
  ),
  days AS (
    SELECT gs::date AS d FROM bounds b,
      generate_series(b.d_from, b.d_to, INTERVAL '1 day') AS gs
  ),
  agg AS (
    SELECT t.occurred_at::date AS d,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'income'), 0)::BIGINT AS income_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.type = 'expense'), 0)::BIGINT AS expense_cents
    FROM transactions t, bounds b
    WHERE t.book_id = p_book_id
      AND t.deleted_at IS NULL
      AND t.type IN ('income', 'expense')
      AND t.occurred_at >= b.d_from::timestamptz
      AND t.occurred_at < (b.d_to + 1)::timestamptz
    GROUP BY t.occurred_at::date
  )
  SELECT to_char(days.d, 'YYYY-MM-DD') AS day,
         COALESCE(agg.income_cents, 0)::BIGINT AS income_cents,
         COALESCE(agg.expense_cents, 0)::BIGINT AS expense_cents
  FROM days
  LEFT JOIN agg ON agg.d = days.d
  ORDER BY days.d
$$;

-- 函数默认已有 PUBLIC EXECUTE；显式授权，避免重新部署后角色权限漂移。
GRANT EXECUTE ON FUNCTION
  account_balance(BIGINT, TIMESTAMPTZ),
  book_balance_snapshot(BIGINT, TIMESTAMPTZ),
  book_monthly_summary(BIGINT, TEXT),
  init_book_template(BIGINT),
  archive_book(BIGINT),
  restore_book(BIGINT),
  category_breakdown(BIGINT, TEXT, TEXT, TEXT),
  daily_trend(BIGINT, TEXT, TEXT)
TO authenticated, anon;
