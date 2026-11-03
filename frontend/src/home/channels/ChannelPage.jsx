import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LuArrowLeft, LuEllipsisVertical, LuImagePlus, LuLink, LuLoaderCircle, LuPencil, LuSendHorizontal, LuSmilePlus, LuTrash2, LuX } from 'react-icons/lu'
import useConversation from '../../Zustand/UserConversation'
import { useAuth } from '../../context/AuthProvider'
import ChannelAvatar from './ChannelAvatar'
import ConfirmDialog from '../ConfirmDialog'
import Sheet from '../groups/Sheet'
import { LinkifiedText, LinkPreviewCard, YouTubeFromText } from '../rightPart/LinkPreview'
import { CHANNEL_EVENT, channelsApi, errorOf, loadChannels } from '../../utils/channels'
import { QUICK_REACTIONS } from '../../utils/messages'
import { compressImage } from '../../utils/attachments'

const time = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const day = (d) => {
  const date = new Date(d)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const followers = (n) => `${n.toLocaleString()} follower${n === 1 ? '' : 's'}`

// One post: text, photo/video, link preview, reactions
const Post = ({ post, myId, canReact, amAdmin, onReact, onDelete }) => {
  const [picking, setPicking] = useState(false)
  const groups = Object.values(post.reactions.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, mine: false }
    acc[r.emoji].count++
    if (String(r.userId) === myId) acc[r.emoji].mine = true
    return acc
  }, {}))
  const a = post.attachment
  return (
    <div className="group relative max-w-[min(92%,560px)]">
      <div className="overflow-hidden rounded-2xl bg-white text-[14px] leading-relaxed text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700/60">
        {a?.kind === 'image' && <img src={a.url} alt="" loading="lazy" className="max-h-[420px] w-full bg-slate-100 object-cover dark:bg-slate-900" />}
        {a?.kind === 'video' && <video src={a.url} controls preload="metadata" className="max-h-[420px] w-full bg-black" />}
        {(post.text || post.linkPreview) && (
          <div className="px-3.5 py-2.5">
            {post.text && <p className="whitespace-pre-wrap wrap-break-word"><LinkifiedText text={post.text} /></p>}
            {post.linkPreview && <LinkPreviewCard preview={post.linkPreview} />}
            {post.text && !post.linkPreview?.title && <YouTubeFromText text={post.text} />}
          </div>
        )}
        <p className={`px-3.5 pb-2 text-right text-[11px] text-slate-400 ${post.text || post.linkPreview ? '-mt-1' : 'pt-2'}`}>{time(post.createdAt)}</p>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {groups.map((g) => (
          <button key={g.emoji} onClick={() => canReact && onReact(post, g.emoji)} disabled={!canReact}
            className={`flex h-7 items-center gap-1 rounded-full px-2 text-[13px] ring-1 transition ${g.mine ? 'bg-indigo-50 ring-indigo-300 dark:bg-indigo-500/15 dark:ring-indigo-500/40' : 'bg-white ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:ring-slate-700'}`}>
            {g.emoji}<span className="text-xs font-medium text-slate-600 dark:text-slate-300">{g.count}</span>
          </button>
        ))}
        {canReact && (
          <div className="relative">
            <button onClick={() => setPicking((v) => !v)} aria-label="React" className="flex size-7 items-center justify-center rounded-full text-slate-400 opacity-60 transition hover:bg-white hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-white">
              <LuSmilePlus className="size-4" />
            </button>
            {picking && (
              <div className="absolute bottom-9 left-0 z-20 flex gap-0.5 rounded-full bg-white p-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} onClick={() => { setPicking(false); onReact(post, e) }} className="flex size-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-slate-100 dark:hover:bg-slate-700">{e}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {amAdmin && (
          <button onClick={() => onDelete(post)} aria-label="Delete post" className="flex size-7 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-red-600 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800">
            <LuTrash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// Admins: edit name and description
const EditChannel = ({ channel, onClose, onSaved }) => {
  const [name, setName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const field = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900'
  const save = async () => {
    setBusy(true); setError('')
    try { const res = await channelsApi.update(channel._id, { name, description }); onSaved(res.data); onClose() } catch (err) { setError(errorOf(err)); setBusy(false) }
  }
  const upload = async (file) => {
    if (!file) return
    const form = new FormData(); form.append('avatar', file)
    setBusy(true); setError('')
    try { const res = await channelsApi.update(channel._id, form); onSaved(res.data) } catch (err) { setError(errorOf(err)) }
    setBusy(false)
  }
  return (
    <Sheet open onClose={onClose} title="Edit channel" footer={
      <button onClick={save} disabled={busy || name.trim().length < 2} className="h-11 w-full rounded-xl bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
    }>
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-4">
          <ChannelAvatar channel={channel} size="lg" />
          <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-indigo-400 dark:ring-slate-700 dark:hover:bg-slate-800">
            Change picture
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className={`${field} h-11`} aria-label="Name" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={4} placeholder="Description" className={`${field} resize-none py-2.5`} />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Sheet>
  )
}

// Right side for a channel: header with Follow, posts (newest at the bottom), composer for admins
const ChannelPage = ({ channel: summary }) => {
  const [AuthUser] = useAuth()
  const myId = String(AuthUser?._id)
  const { setSelectedConversation } = useConversation()
  const [channel, setChannel] = useState(summary)
  const [posts, setPosts] = useState(null)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'delete' | 'unfollow' | { post }
  const [copied, setCopied] = useState(false)
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const id = summary._id

  const scrollDown = () => requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight })

  const load = useCallback(async () => {
    try {
      const [ch, ps] = await Promise.all([channelsApi.get(id), channelsApi.posts(id)])
      setChannel(ch.data); setPosts(ps.data.posts); setMore(ps.data.more); scrollDown()
      if (ch.data.following || ch.data.amAdmin) channelsApi.read(id).then(loadChannels).catch(() => {})
    } catch (err) { setError(errorOf(err)); setPosts([]) }
  }, [id])
  useEffect(() => { load() }, [load])

  // Live: new / changed / deleted posts
  useEffect(() => {
    const on = (e) => {
      const d = e.detail
      if (d.channelId !== id) return
      if (d.type === 'channelPost') {
        setPosts((p) => (p && !p.some((x) => x._id === d.post._id) ? [...p, d.post] : p))
        const el = listRef.current
        if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) scrollDown()
        channelsApi.read(id).catch(() => {})
      } else if (d.type === 'channelPostUpdated') setPosts((p) => p?.map((x) => (x._id === d.post._id ? d.post : x)))
      else if (d.type === 'channelPostDeleted') setPosts((p) => p?.filter((x) => x._id !== d.postId))
      else if (d.type === 'channelUpdated') channelsApi.get(id).then((r) => setChannel(r.data)).catch(() => {})
      else if (d.type === 'channelDeleted') setSelectedConversation(null)
    }
    window.addEventListener(CHANNEL_EVENT, on)
    return () => window.removeEventListener(CHANNEL_EVENT, on)
  }, [id, setSelectedConversation])

  const loadOlder = async () => {
    if (!posts?.length || loadingMore) return
    setLoadingMore(true)
    const el = listRef.current
    const before = el?.scrollHeight || 0
    try {
      const res = await channelsApi.posts(id, posts[0].createdAt)
      setPosts((p) => [...res.data.posts, ...p]); setMore(res.data.more)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before })
    } catch { /* keep what we have */ }
    setLoadingMore(false)
  }

  const run = async (fn) => { setError(''); try { await fn() } catch (err) { setError(errorOf(err)) } }
  const follow = () => run(async () => { const r = await channelsApi.follow(id); setChannel(r.data); loadChannels() })
  const unfollow = () => run(async () => { const r = await channelsApi.unfollow(id); setChannel(r.data); setConfirm(null); loadChannels() })
  const remove = () => run(async () => { await channelsApi.remove(id); setConfirm(null); await loadChannels(); setSelectedConversation(null) })
  const react = (post, emoji) => run(async () => { const r = await channelsApi.react(id, post._id, emoji); setPosts((p) => p.map((x) => (x._id === r.data._id ? r.data : x))) })
  const deletePost = (post) => run(async () => { await channelsApi.deletePost(id, post._id); setPosts((p) => p.filter((x) => x._id !== post._id)); setConfirm(null) })
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/?channel=${channel.handle}`); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
    setMenu(false)
  }

  const send = async (e) => {
    e?.preventDefault()
    if (sending || (!text.trim() && !file)) return
    setSending(true); setError('')
    const form = new FormData()
    form.append('text', text.trim())
    try {
      if (file) { const small = await compressImage(file); form.append('file', small, small.name) }
      const res = await channelsApi.post(id, form)
      setPosts((p) => (p.some((x) => x._id === res.data._id) ? p : [...p, res.data]))
      setText(''); setFile(null); scrollDown(); loadChannels()
    } catch (err) { setError(errorOf(err)) }
    setSending(false)
  }

  const canReact = channel.following || channel.amAdmin

  return (
    <div className="chat-bg flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5 dark:border-slate-800 dark:bg-slate-950">
        <button onClick={() => setSelectedConversation(null)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800" aria-label="Back"><LuArrowLeft className="size-5" /></button>
        <ChannelAvatar channel={channel} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{channel.name}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{channel.handle} · {followers(channel.followerCount || 0)}</p>
        </div>
        {!channel.amAdmin && !channel.following && (
          <button onClick={follow} className="h-9 rounded-full bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500">Follow</button>
        )}
        <div className="relative">
          <button onClick={() => setMenu((v) => !v)} className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Channel options"><LuEllipsisVertical className="size-5" /></button>
          {menu && (
            <div className="absolute right-0 top-11 z-30 w-52 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700" onMouseLeave={() => setMenu(false)}>
              <button onClick={copyLink} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><LuLink className="size-4" /> {copied ? 'Copied!' : 'Copy channel link'}</button>
              {channel.amAdmin && <button onClick={() => { setMenu(false); setEditing(true) }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><LuPencil className="size-4" /> Edit channel</button>}
              {channel.following && <button onClick={() => { setMenu(false); setConfirm('unfollow') }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"><LuX className="size-4" /> Unfollow</button>}
              {channel.amOwner && <button onClick={() => { setMenu(false); setConfirm('delete') }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"><LuTrash2 className="size-4" /> Delete channel</button>}
            </div>
          )}
        </div>
      </div>

      {/* Posts */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto mb-6 max-w-md text-center">
          <div className="flex justify-center"><ChannelAvatar channel={channel} size="lg" /></div>
          <p className="mt-3 text-lg font-semibold">{channel.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">@{channel.handle} · {followers(channel.followerCount || 0)}</p>
          {channel.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{channel.description}</p>}
        </div>
        {more && (
          <div className="mb-3 flex justify-center">
            <button onClick={loadOlder} className="h-8 rounded-full bg-white px-3 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">{loadingMore ? 'Loading…' : 'Load older posts'}</button>
          </div>
        )}
        {posts === null ? (
          <div className="flex justify-center py-10 text-slate-400"><LuLoaderCircle className="size-6 animate-spin" /></div>
        ) : posts.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">{channel.amAdmin ? 'No posts yet. Write the first update below.' : 'No posts yet.'}</p>
        ) : (
          <div className="space-y-3">
            {posts.map((post, i) => {
              const d = day(post.createdAt)
              const showDay = i === 0 || day(posts[i - 1].createdAt) !== d
              return (
                <React.Fragment key={post._id}>
                  {showDay && <div className="flex justify-center py-1"><span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800/90 dark:text-slate-400 dark:ring-slate-700/60">{d}</span></div>}
                  <Post post={post} myId={myId} canReact={canReact} amAdmin={channel.amAdmin} onReact={react} onDelete={(p) => setConfirm({ post: p })} />
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>

      {error && <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {/* Composer (admins) / follow bar (everyone else) */}
      {channel.amAdmin ? (
        <form onSubmit={send} className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-950">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-900">
              <LuImagePlus className="size-4 text-indigo-500" /><span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white" aria-label="Remove"><LuX className="size-4" /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Add photo or video"><LuImagePlus className="size-5" /></button>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = '' }} />
            <textarea
              value={text} onChange={(e) => setText(e.target.value.slice(0, 4000))} rows={1} placeholder="Write an update for your followers"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none transition focus:bg-white focus:ring-2 focus:ring-indigo-500/30 dark:bg-slate-900"
            />
            <button type="submit" disabled={sending || (!text.trim() && !file)} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40" aria-label="Post">
              {sending ? <LuLoaderCircle className="size-5 animate-spin" /> : <LuSendHorizontal className="size-5" />}
            </button>
          </div>
        </form>
      ) : (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-950">
          {channel.following
            ? <p className="text-xs text-slate-500 dark:text-slate-400">Only admins can post. You can react to updates.</p>
            : <button onClick={follow} className="h-10 w-full max-w-xs rounded-full bg-indigo-600 text-sm font-semibold text-white transition hover:bg-indigo-500">Follow channel</button>}
        </div>
      )}

      {editing && <EditChannel channel={channel} onClose={() => setEditing(false)} onSaved={(c) => { setChannel(c); loadChannels() }} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirm === 'delete' ? remove : confirm === 'unfollow' ? unfollow : () => deletePost(confirm.post)}
        icon={confirm === 'unfollow' ? LuX : LuTrash2}
        title={confirm === 'delete' ? `Delete ${channel.name}?` : confirm === 'unfollow' ? `Unfollow ${channel.name}?` : 'Delete this post?'}
        description={confirm === 'delete' ? 'All posts are removed for every follower. This can’t be undone.' : confirm === 'unfollow' ? 'You’ll stop getting its updates. You can follow again any time.' : 'It’s removed for every follower.'}
        confirmLabel={confirm === 'unfollow' ? 'Unfollow' : 'Delete'}
        busyLabel={confirm === 'unfollow' ? 'Unfollowing…' : 'Deleting…'}
      />
    </div>
  )
}

export default ChannelPage
