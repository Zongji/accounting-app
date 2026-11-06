import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BookRow, BookType } from '../cloud/database.types'
import {
  BOOK_COLORS,
  BOOK_TYPES,
  useArchiveBook,
  useBooks,
  useCreateBook,
  useReorderBook,
  useRestoreBook,
  useUpdateBook,
  type BookInput,
} from '../data/books'
import { useAccounts } from '../data/accounts'
import { useCategoryOptions } from '../data/categories'
import { useRecentTransactions } from '../data/transactions'
import { useCurrentBookId } from '../data/useCurrentBook'
import { useAppStore } from '../store/useAppStore'
import { toUserMessage } from '../lib/errors'
import { Modal } from '../components/Modal'
import { RecentTransactions } from '../components/RecentTransactions'
import {
  bookTypeLabel,
  cardClass,
  colorChip,
  ghostBtnClass,
  inputClass,
  labelClass,
  primaryBtnClass,
  smallBtnClass,
  smallDangerBtnClass,
  smallPrimaryBtnClass,
} from '../components/ui'

interface BookFormModalProps {
  open: boolean
  initial: BookRow | null
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: BookInput) => void
}

function BookFormModal({ open, initial, busy, error, onClose, onSubmit }: BookFormModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<BookType>('personal')
  const [color, setColor] = useState<string>(BOOK_COLORS[0])

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setType(initial?.type ?? 'personal')
    setColor(initial?.color ?? BOOK_COLORS[0])
  }, [open, initial])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit({ name: name.trim(), type, color, icon: null })
  }

  return (
    <Modal
      open={open}
      title={initial ? '编辑账本' : '新建账本'}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtnClass} onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" form="book-form" className={primaryBtnClass} disabled={busy}>
            {busy ? '保存中…' : initial ? '保存修改' : '创建账本'}
          </button>
        </div>
      }
    >
      <form id="book-form" onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="book-name" className={labelClass}>账本名称</label>
          <input
            id="book-name"
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：日常开销"
            maxLength={40}
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="book-type" className={labelClass}>账本类型</label>
          <select
            id="book-type"
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as BookType)}
          >
            {BOOK_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={labelClass}>标识颜色</span>
          <div className="flex flex-wrap gap-2">
            {BOOK_COLORS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`选择颜色 ${item}`}
                aria-pressed={color === item}
                onClick={() => setColor(item)}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  color === item ? 'border-slate-800 scale-110' : 'border-white'
                }`}
                style={{ backgroundColor: item }}
              />
            ))}
          </div>
        </div>
        {!initial && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            创建后会自动在单事务内初始化 4 个默认账户（现金 / 储蓄卡 / 微信钱包 / 支付宝），
            分类直接引用内置模板。账户与分类之后可在「账本设置」里独立修改。
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
      </form>
    </Modal>
  )
}

export function BooksPage() {
  const navigate = useNavigate()
  const currentBookId = useCurrentBookId()
  const setCurrentBookId = useAppStore((state) => state.setCurrentBookId)
  const openCreate = useAppStore((state) => state.openCreate)

  const { data: books = [], isLoading, isError, error: listError } = useBooks()
  const { data: accounts = [] } = useAccounts(currentBookId)
  const { data: categories = [] } = useCategoryOptions(currentBookId)
  const { data: recent = [] } = useRecentTransactions(currentBookId, 5)

  const createBook = useCreateBook()
  const updateBook = useUpdateBook()
  const reorderBook = useReorderBook()
  const archiveBook = useArchiveBook()
  const restoreBook = useRestoreBook()

  const [editing, setEditing] = useState<BookRow | 'new' | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeBooks = books.filter((book) => book.archived_at === null)
  const archivedBooks = books.filter((book) => book.archived_at !== null)
  const busy = createBook.isPending || updateBook.isPending

  async function run(task: () => Promise<unknown>, successMessage?: string): Promise<boolean> {
    setPageError(null)
    setNotice(null)
    try {
      await task()
      if (successMessage) setNotice(successMessage)
      return true
    } catch (error) {
      setPageError(toUserMessage(error))
      return false
    }
  }

  function enterBook(bookId: number) {
    // 先同步全局上下文（会触发账本维度缓存失效），再跳转到该账本的设置页。
    setCurrentBookId(bookId)
    navigate(`/book/${bookId}/settings`)
  }

  async function submitBook(input: BookInput) {
    if (editing === 'new') {
      setPageError(null)
      try {
        const id = await createBook.mutateAsync(input)
        setEditing(null)
        enterBook(id)
      } catch (error) {
        setPageError(toUserMessage(error))
      }
      return
    }
    if (editing) {
      const ok = await run(
        () =>
          updateBook.mutateAsync({
            id: editing.id,
            patch: { name: input.name, type: input.type, color: input.color },
          }),
        '账本已更新',
      )
      if (ok) setEditing(null)
    }
  }

  function moveBook(book: BookRow, direction: -1 | 1) {
    const index = activeBooks.findIndex((item) => item.id === book.id)
    const neighbor = activeBooks[index + direction]
    if (!neighbor) return
    const sortOrder = direction === -1 ? neighbor.sort_order - 1 : neighbor.sort_order + 1
    void run(() => reorderBook.mutateAsync({ id: book.id, sortOrder }), '顺序已更新')
  }

  function archive(book: BookRow) {
    const confirmed = window.confirm(
      `归档「${book.name}」？\n\n该账本的账户与自定义分类会一并归档，流水保留但不再显示。可在下方「已归档账本」里恢复。`,
    )
    if (!confirmed) return
    void run(async () => {
      await archiveBook.mutateAsync(book.id)
      if (currentBookId === book.id) setCurrentBookId(null)
    }, '账本已归档')
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-indigo-500">账本</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">我的账本</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            每个账本拥有独立的账户配置与流水，账本之间数据完全隔离。
          </p>
        </div>
        <button type="button" className={primaryBtnClass} onClick={() => setEditing('new')}>
          + 新建账本
        </button>
      </header>

      {pageError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {pageError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      {isError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          账本列表加载失败：{toUserMessage(listError)}
        </p>
      )}

      {isLoading ? (
        <div className={cardClass}>
          <p className="text-sm text-slate-400">正在加载账本…</p>
        </div>
      ) : activeBooks.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-sm font-medium text-slate-700">还没有账本</p>
          <p className="mt-1.5 text-xs text-slate-500">新建一个账本，会自动配好一套默认账户。</p>
          <button
            type="button"
            className={`${primaryBtnClass} mt-4`}
            onClick={() => setEditing('new')}
          >
            创建第一个账本
          </button>
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {activeBooks.map((book, index) => {
            const isCurrent = book.id === currentBookId
            return (
              <article
                key={book.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition ${
                  isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                }`}
              >
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: colorChip(book.color) }} />
                <div className="flex items-start justify-between gap-2 pl-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-semibold text-slate-900">{book.name}</h2>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
                          当前
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {bookTypeLabel(book.type)} · {book.base_currency}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label="上移"
                      disabled={index === 0 || reorderBook.isPending}
                      onClick={() => moveBook(book, -1)}
                      className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="下移"
                      disabled={index === activeBooks.length - 1 || reorderBook.isPending}
                      onClick={() => moveBook(book, 1)}
                      className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 pl-2">
                  <button
                    type="button"
                    onClick={() => enterBook(book.id)}
                    className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    进入账本
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(book)}
                    className={smallBtnClass}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(book)}
                    disabled={archiveBook.isPending}
                    className={smallDangerBtnClass}
                  >
                    归档
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {archivedBooks.length > 0 && (
        <details className={cardClass}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            已归档账本（{archivedBooks.length}）
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {archivedBooks.map((book) => (
              <li key={book.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-600">{book.name}</p>
                  <p className="text-xs text-slate-400">{bookTypeLabel(book.type)} · 已归档</p>
                </div>
                <button
                  type="button"
                  disabled={restoreBook.isPending}
                  className={smallBtnClass}
                  onClick={() => void run(() => restoreBook.mutateAsync(book.id), '账本已恢复')}
                >
                  恢复
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className={cardClass}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">最近流水</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {currentBookId ? '当前账本最新的 5 条记录（只读）' : '选择账本后可查看最近流水'}
            </p>
          </div>
          <button
            type="button"
            disabled={currentBookId === null}
            onClick={openCreate}
            className={smallPrimaryBtnClass}
          >
            记一笔
          </button>
        </div>
        <RecentTransactions
          transactions={recent}
          accounts={accounts}
          categories={categories}
          emptyHint={currentBookId ? '还没有流水，点「记一笔」写入第一条' : '请先在上方进入一个账本'}
        />
      </section>

      <BookFormModal
        open={editing !== null}
        initial={editing === 'new' || editing === null ? null : editing}
        busy={busy}
        error={pageError}
        onClose={() => { setEditing(null); setPageError(null) }}
        onSubmit={(input) => void submitBook(input)}
      />
    </div>
  )
}
