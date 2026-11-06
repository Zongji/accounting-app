/**
 * 云端数据库类型（对应 sql/001_schema.sql 与 sql/002_functions.sql）。
 *
 * 传给 createWorkBuddyCloud<Database>() 后，from() 的行与 rpc() 的参数、
 * 返回值都有类型约束。后续若改动 DDL，请同步更新本文件。
 * 用 type 而非 interface：需要隐式索引签名才能满足 SDK 的 Record<string, unknown>。
 */

export type BookType = 'personal' | 'family' | 'business' | 'travel' | 'other'
export type AccountType =
  | 'cash'
  | 'debit_card'
  | 'credit_card'
  | 'ewallet'
  | 'investment'
  | 'receivable'
  | 'liability'
export type CategoryKind = 'expense' | 'income' | 'transfer'
export type TxnType = 'expense' | 'income' | 'transfer'

type Timestamp = string

export type BookRow = {
  id: number
  owner_id: string
  name: string
  type: BookType
  base_currency: string
  icon: string | null
  color: string | null
  sort_order: number
  archived_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type AccountRow = {
  id: number
  owner_id: string
  book_id: number
  name: string
  type: AccountType
  initial_balance_cents: number
  currency: string
  include_in_total: boolean
  credit_limit_cents: number | null
  icon: string | null
  color: string | null
  sort_order: number
  archived_at: Timestamp | null
  created_at: Timestamp
}

export type CategoryRow = {
  id: number
  owner_id: string
  book_id: number | null
  parent_id: number | null
  name: string
  kind: CategoryKind
  icon: string | null
  color: string | null
  sort_order: number
  archived_at: Timestamp | null
  created_at: Timestamp
}

export type TransactionRow = {
  id: number
  owner_id: string
  book_id: number
  account_id: number
  counter_account_id: number | null
  category_id: number | null
  type: TxnType
  amount_cents: number
  fee_cents: number
  currency: string
  occurred_at: Timestamp
  note: string | null
  tags: string[]
  attachment_urls: string[]
  client_token: string | null
  deleted_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type AccountBalanceRow = {
  account_id: number
  account_name: string
  account_type: AccountType
  currency: string
  include_in_total: boolean
  initial_balance_cents: number
  balance_cents: number
}

export type MonthlySummaryRow = {
  month: string
  income_cents: number
  expense_cents: number
  net_cents: number
  transfer_cents: number
  txn_count: number
}

export type CategoryBreakdownRow = {
  category_id: number
  category_name: string
  total_cents: number
  txn_count: number
}

export type DailyTrendRow = {
  day: string
  income_cents: number
  expense_cents: number
}

/** Insert/Update 里绝不出现 owner_id：由数据库 DEFAULT auth.uid() 填充。 */
type InsertOf<Row> = Partial<Omit<Row, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>
type UpdateOf<Row> = Partial<Omit<Row, 'id' | 'owner_id' | 'created_at'>>

interface TableShape<Row> {
  Row: Row
  Insert: InsertOf<Row>
  Update: UpdateOf<Row>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      books: TableShape<BookRow>
      accounts: TableShape<AccountRow>
      categories: TableShape<CategoryRow>
      transactions: TableShape<TransactionRow>
    }
    Views: Record<string, never>
    Functions: {
      account_balance: {
        Args: { p_account_id: number; p_as_of?: Timestamp }
        Returns: number
      }
      book_balance_snapshot: {
        Args: { p_book_id: number; p_as_of?: Timestamp }
        Returns: AccountBalanceRow[]
      }
      book_monthly_summary: {
        Args: { p_book_id: number; p_month?: string }
        Returns: MonthlySummaryRow[]
      }
      category_breakdown: {
        Args: { p_book_id: number; p_from: string; p_to: string; p_kind: string }
        Returns: CategoryBreakdownRow[]
      }
      daily_trend: {
        Args: { p_book_id: number; p_from: string; p_to: string }
        Returns: DailyTrendRow[]
      }
      init_book_template: {
        Args: { p_book_id: number }
        Returns: { created_accounts: number }[]
      }
      archive_book: {
        Args: { p_book_id: number }
        Returns: { archived_accounts: number; archived_categories: number }[]
      }
      restore_book: {
        Args: { p_book_id: number }
        Returns: { restored_accounts: number; restored_categories: number }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
