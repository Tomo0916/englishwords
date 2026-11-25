/**
 * 単語帳の絵。
 * Supabase Storage の非公開バケット images に {番号}.webp と index.json（どの番号の絵があるか）を置く。
 * 一度見た絵は端末に保存し、次からは通信なしで表示する。
 */
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Word } from './types'

const CACHE = 'images-v1'
const LS_KEY = 'images-index-v1'

interface ImageIndex {
  /** 絵を差しかえたら上がる番号（古い絵を使わないため） */
  v: number
  ids: number[]
}

let index: { v: number; ids: Set<number> } | null = null
try {
  const s = localStorage.getItem(LS_KEY)
  if (s) {
    const j = JSON.parse(s) as ImageIndex
    index = { v: j.v, ids: new Set(j.ids) }
  }
} catch {
  index = null
}

let loading: Promise<void> | null = null
/** index.json を一度だけ読む（オフラインなら前回の分を使う） */
function loadIndex() {
  if (loading) return loading
  loading = (async () => {
    if (!supabase || !navigator.onLine) return
    try {
      const { data } = await supabase.storage.from('images').download('index.json')
      if (!data) return
      const j = JSON.parse(await data.text()) as ImageIndex
      index = { v: j.v, ids: new Set(j.ids) }
      localStorage.setItem(LS_KEY, JSON.stringify(j))
    } catch {
      /* まだ絵がない・通信できない */
    }
  })()
  return loading
}

/** 付録の語は本編の同じ語の絵を使う */
export const imageIdOf = (w: Word) => (w.round === 13 ? (w.mainId ?? null) : w.id)

const urls = new Map<number, string>()
const inflight = new Map<number, Promise<string | null>>()
const cacheKey = (id: number, v: number) => new Request(`${location.origin}/__images__/${v}/${id}.webp`)

async function fetchImage(id: number): Promise<string | null> {
  await loadIndex()
  if (!index?.ids.has(id)) return null
  const hit = urls.get(id)
  if (hit) return hit
  let p = inflight.get(id)
  if (p) return p
  const v = index.v
  p = (async () => {
    let blob: Blob | null = null
    let cache: Cache | null = null
    try {
      cache = await caches.open(CACHE)
      const r = await cache.match(cacheKey(id, v))
      if (r) blob = await r.blob()
    } catch {
      cache = null
    }
    if (!blob && supabase && navigator.onLine) {
      try {
        const { data } = await supabase.storage.from('images').download(`${id}.webp`)
        if (data) {
          blob = data
          try {
            await cache?.put(cacheKey(id, v), new Response(data, { headers: { 'content-type': 'image/webp' } }))
          } catch {
            /* 容量不足などは無視 */
          }
        }
      } catch {
        blob = null
      }
    }
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urls.set(id, url)
    return url
  })().finally(() => inflight.delete(id))
  inflight.set(id, p)
  return p
}

/** 単語の絵の URL（ない・読み込み中は null） */
export function useWordImage(w: Word) {
  const id = imageIdOf(w)
  const [url, setUrl] = useState<string | null>(() => (id ? (urls.get(id) ?? null) : null))
  useEffect(() => {
    let alive = true
    setUrl(id ? (urls.get(id) ?? null) : null)
    if (id) void fetchImage(id).then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [id])
  return url
}

/** これから出てくる単語の絵を裏で先読みする */
export async function prefetchImages(words: Word[]) {
  await loadIndex()
  const ids = words.map(imageIdOf).filter((id): id is number => !!id && !!index?.ids.has(id))
  let i = 0
  const run = async () => {
    while (i < ids.length) await fetchImage(ids[i++])
  }
  await Promise.all([run(), run(), run()])
}
