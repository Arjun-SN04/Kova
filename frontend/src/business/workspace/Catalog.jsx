import React, { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { LuImagePlus, LuLoaderCircle, LuPackage, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu'
import Sheet from '../../home/groups/Sheet'
import { compressImage } from '../../utils/attachments'
import { api, bizUrl, errorOf, money, shopUrl } from '../utils'
import { Empty, Field, PageHeader, Toggle, btn, cardCls, inputCls, textareaCls } from './ui'

// Add or edit one catalog item (with an optional photo)
const ItemDialog = ({ ws, item, onClose, onSaved }) => {
  const [name, setName] = useState(item?.name || '')
  const [price, setPrice] = useState(item ? String(item.price) : '')
  const [description, setDescription] = useState(item?.description || '')
  const [inStock, setInStock] = useState(item?.inStock ?? true)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(item?.image?.url || null)
  const [removeImage, setRemoveImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)

  const pick = async (f) => {
    if (!f) return
    setError('')
    try {
      const small = await compressImage(f)
      if (small.size > 2 * 1024 * 1024) throw new Error('That photo is too large (max 2 MB)')
      setFile(small); setPreview(URL.createObjectURL(small)); setRemoveImage(false)
    } catch (err) { setError(err.message) }
  }
  const save = async (e) => {
    e?.preventDefault()
    setBusy(true); setError('')
    const body = new FormData()
    body.append('name', name)
    body.append('price', price)
    body.append('description', description)
    body.append('inStock', String(inStock))
    if (file) body.append('image', file, file.name || 'photo.jpg')
    if (removeImage) body.append('removeImage', 'true')
    try {
      const res = item
        ? await axios.put(bizUrl(ws.biz, `/products/${item._id}`), body, api)
        : await axios.post(bizUrl(ws.biz, '/products'), body, api)
      onSaved(res.data.product); onClose()
    } catch (err) { setError(errorOf(err)); setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title={item ? 'Edit item' : 'New item'} wide footer={
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btn.ghost}>Cancel</button>
        <button onClick={save} disabled={busy || !name.trim() || price === ''} className={btn.primary}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    }>
      <form onSubmit={save} className="space-y-4 pt-1">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => input.current?.click()} className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200 transition hover:ring-indigo-300 dark:bg-slate-800 dark:ring-slate-700" aria-label="Choose a photo">
            {preview ? <img src={preview} alt="" className="size-full object-cover" /> : <LuImagePlus className="size-6" />}
          </button>
          <div className="text-[13px] text-slate-500 dark:text-slate-400">
            <p>A clear photo helps customers choose.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => input.current?.click()} className={btn.secondary}>{preview ? 'Change photo' : 'Add photo'}</button>
              {preview && <button type="button" onClick={() => { setPreview(null); setFile(null); setRemoveImage(true) }} className={btn.ghost}>Remove</button>}
            </div>
          </div>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} autoFocus placeholder="Chocolate truffle cake" /></Field>
          <Field label="Price (₹)"><input type="number" min="0" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="650" /></Field>
        </div>
        <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} className={textareaCls} placeholder="Sizes, ingredients, delivery time…" /></Field>
        <Toggle checked={inStock} onChange={setInStock} label="In stock" description="Out-of-stock items stay visible but can't be ordered." />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>
    </Sheet>
  )
}

const Catalog = ({ ws }) => {
  const [products, setProducts] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | product
  const [error, setError] = useState('')
  const load = useCallback(() => {
    axios.get(bizUrl(ws.biz, '/products'), api).then((r) => setProducts(r.data.products)).catch((err) => setError(errorOf(err)))
  }, [ws.biz])
  useEffect(load, [load])

  const saved = (p) => setProducts((list) => (list.some((x) => x._id === p._id) ? list.map((x) => (x._id === p._id ? p : x)) : [...list, p]))
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}? Cards already sent in chats will show it as unavailable.`)) return
    try { await axios.delete(bizUrl(ws.biz, `/products/${p._id}`), api); setProducts((list) => list.filter((x) => x._id !== p._id)) } catch (err) { setError(errorOf(err)) }
  }
  const toggleStock = async (p) => {
    const body = new FormData()
    body.append('inStock', String(!p.inStock))
    try { saved((await axios.put(bizUrl(ws.biz, `/products/${p._id}`), body, api)).data.product) } catch (err) { setError(errorOf(err)) }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description={<>Items customers can see, ask about and order on <a href={shopUrl(ws.business.username)} target="_blank" rel="noreferrer" className="font-medium text-white underline underline-offset-2">your business page</a>. Send any item in a chat from the + menu.</>}
        actions={<button onClick={() => setEditing('new')} className={btn.primary}><LuPlus className="size-4" /> Add item</button>}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {products === null ? <div className="flex justify-center py-12"><LuLoaderCircle className="size-5 animate-spin text-slate-400" /></div>
        : products.length === 0 ? (
          <div className={cardCls}>
            <Empty icon={LuPackage} title="Your catalog is empty" description="Add products or services with a photo and price. Customers can order them and you can send them as cards in chats." action={<button onClick={() => setEditing('new')} className={btn.primary}><LuPlus className="size-4" /> Add your first item</button>} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <div key={p._id} className={`group overflow-hidden ${cardCls} transition hover:-translate-y-0.5 hover:shadow-lg`}>
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
                  {p.image?.url ? <img src={p.image.url} alt="" className="size-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <div className="flex size-full flex-col items-center justify-center gap-1 bg-linear-to-br from-indigo-50 to-slate-100 text-indigo-300 dark:from-indigo-500/10 dark:to-slate-800 dark:text-slate-600"><LuPackage className="size-8" /><span className="text-[11px] font-medium text-slate-400">No photo yet</span></div>}
                  <span className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm tabular-nums">{money(p.price)}</span>
                  {!p.inStock && <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-white">Out of stock</span>}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{p.name}</p>
                    </div>
                  {p.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{p.description}</p>}
                  <div className="mt-3 flex items-center gap-1">
                    <button onClick={() => toggleStock(p)} className="mr-auto text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">{p.inStock ? 'Mark out of stock' : 'Mark in stock'}</button>
                    <button onClick={() => setEditing(p)} className={btn.icon} aria-label="Edit"><LuPencil className="size-4" /></button>
                    <button onClick={() => remove(p)} className={`${btn.icon} hover:text-red-600!`} aria-label="Delete"><LuTrash2 className="size-4" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      {editing && <ItemDialog ws={ws} item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />}
    </div>
  )
}

export default Catalog
