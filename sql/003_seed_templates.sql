-- 多账本记账应用 · 内置分类模板 (design.md §4.7)
--
-- 模板以 book_id IS NULL + owner_id = '__system__' 标记，只读引用；
-- 账本需要自定义分类时，复制成 book_id = 新账本 的独立行（后续阶段实现）。
-- 注意：管理通道下 auth.uid() 为 NULL，所以种子数据必须显式给出 owner_id。

INSERT INTO categories (owner_id, book_id, name, kind, icon, sort_order) VALUES
  ('__system__', NULL, '餐饮',     'expense',  'utensils',       10),
  ('__system__', NULL, '交通',     'expense',  'bus',            20),
  ('__system__', NULL, '购物',     'expense',  'shopping-bag',   30),
  ('__system__', NULL, '居家',     'expense',  'home',           40),
  ('__system__', NULL, '娱乐',     'expense',  'gamepad',        50),
  ('__system__', NULL, '医疗',     'expense',  'heart-pulse',    60),
  ('__system__', NULL, '教育',     'expense',  'book',           70),
  ('__system__', NULL, '人情',     'expense',  'gift',           80),
  ('__system__', NULL, '其他支出', 'expense',  'more',           90),
  ('__system__', NULL, '工资',     'income',   'wallet',         10),
  ('__system__', NULL, '奖金',     'income',   'award',           20),
  ('__system__', NULL, '投资收益', 'income',   'trending-up',    30),
  ('__system__', NULL, '兼职',     'income',   'briefcase',      40),
  ('__system__', NULL, '其他收入', 'income',   'more',           50),
  ('__system__', NULL, '账户互转', 'transfer', 'arrow-left-right', 10);
