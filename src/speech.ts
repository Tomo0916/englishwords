/**
 * 音声の再生。
 * 1. Supabase Storage（非公開バケット audio）に生成済みの音声があればそれを再生（端末にキャッシュ）
 * 2. なければブラウザ標準の読み上げ（Web Speech API）で代用
 */
import { CLIP_KINDS, type ClipKind, clipPath, clipText } from './audioText'
import { getSettings } from './settings'
import { supabase } from './supabase'
import type { Word } from './types'
import { VOICES } from './voices'

// ---------- ブラウザ標準の読み上げ（代用） ----------
const pickVoice = (lang: string) => {
  if (!('speechSynthesis' in window)) return null
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)))
  const prefer = lang.startsWith('ja') ? ['Kyoko', 'Google 日本語', 'Microsoft Nanami', 'O-Ren'] : ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex']
  return prefer.map((n) => vs.find((v) => v.name.includes(n))).find(Boolean) ?? vs.find((v) => v.lang.replace('_', '-') === lang) ?? vs[0] ?? null
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function synthSpeak(text: string, lang: 'en-US' | 'ja-JP'): Promise<void> {
  return new Promise((resolve) => {
    if (!canSpeak()) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    const v = pickVoice(lang)
    if (v) u.voice = v
    u.rate = lang === 'en-US' ? 0.9 : 1
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
  })
}

// ---------- 生成済み音声 ----------
const CACHE = 'audio-v4' // 音声を作り直したら番号を上げる（端末の古い音声を使わないため）
let ready: Record<string, boolean> | null = null
let readyLoading: Promise<void> | null = null

/** どの声の音声ファイルがあるか（voices.json）を一度だけ読む */
function loadReady() {
  if (readyLoading) return readyLoading
  readyLoading = (async () => {
    try {
      if (!supabase) return
      const { data } = await supabase.storage.from('audio').download('voices.json')
      ready = data ? JSON.parse(await data.text()) : {}
    } catch {
      ready = {}
    }
  })()
  return readyLoading
}
if (typeof window !== 'undefined') void loadReady()

export function availableVoices() {
  return VOICES.map((v) => ({ ...v, ready: !!ready?.[v.key] }))
}

const cacheKey = (path: string) => new Request(`${location.origin}/__audio__/${path}`)
const inflight = new Map<string, Promise<Blob | null>>()
const memo = new Map<string, Blob>() // このページを開いている間の手元コピー（キャッシュを開く手間も省く）

/** 音声ファイルを取ってくる（端末に保存済みならそれを使う）。同じファイルの同時取得は1回にまとめる */
function fetchClip(path: string): Promise<Blob | null> {
  const m = memo.get(path)
  if (m) return Promise.resolve(m)
  let p = inflight.get(path)
  if (p) return p
  p = (async () => {
    let cache: Cache | null = null
    try {
      cache = await caches.open(CACHE)
      const hit = await cache.match(cacheKey(path))
      if (hit) return await hit.blob()
    } catch {
      cache = null
    }
    if (!supabase || !navigator.onLine) return null
    try {
      const { data } = await supabase.storage.from('audio').download(path)
      if (!data) return null
      try {
        await cache?.put(cacheKey(path), new Response(data, { headers: { 'content-type': 'audio/mpeg' } }))
      } catch {
        /* 容量不足などは無視（再生はできる） */
      }
      return data
    } catch {
      return null
    }
  })()
    .then((b) => {
      if (b) {
        memo.set(path, b)
        if (memo.size > 300) memo.delete(memo.keys().next().value!) // 古いものから手放す（端末の保存分は残る）
      }
      return b
    })
    .finally(() => inflight.delete(path))
  inflight.set(path, p)
  return p
}

/** すでに端末に保存されているか */
async function isCached(path: string) {
  if (memo.has(path)) return true
  try {
    return !!(await (await caches.open(CACHE)).match(cacheKey(path)))
  } catch {
    return false
  }
}

/** 先読み・まとめて保存の対象になるファイル */
async function clipPaths(words: Word[], kinds: ClipKind[]) {
  await loadReady()
  const { voice } = getSettings()
  if (!ready?.[voice]) return []
  return words.flatMap((w) => kinds.filter((k) => clipText(w, k)).map((k) => clipPath(voice, w.id, k)))
}

/** 決まった数ずつ並行して取ってくる */
async function fetchMany(paths: string[], parallel: number, onEach?: () => void, shouldStop?: () => boolean) {
  let i = 0
  const run = async () => {
    while (i < paths.length && !shouldStop?.()) {
      await fetchClip(paths[i++])
      onEach?.()
    }
  }
  await Promise.all(Array.from({ length: parallel }, run))
}

/**
 * これから使いそうな音声を裏で先読みする（クイズ開始時・単語一覧を開いたとき）。
 * 通信量節約モードの端末では行わない。
 */
export async function prefetchWords(words: Word[], kinds: ClipKind[] = ['w', 'wj', 'e', 'ej']) {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (conn?.saveData || !navigator.onLine) return
  const paths = await clipPaths(words, kinds)
  await fetchMany(paths, 4)
}

/** 単語の音声がどれだけ端末に保存されているか */
export async function cachedCount(words: Word[]) {
  const paths = await clipPaths(words, CLIP_KINDS)
  let n = 0
  for (const p of paths) if (await isCached(p)) n++
  return { done: n, total: paths.length }
}

/** 単語の音声をすべて端末に保存する（ROUND ごとの「音声を保存」ボタン）。進み具合を onProgress で知らせる */
export async function saveWords(words: Word[], onProgress: (done: number, total: number) => void, shouldStop: () => boolean) {
  const paths = await clipPaths(words, CLIP_KINDS)
  try {
    await navigator.storage?.persist?.() // 端末が勝手に消さないようお願いする（対応ブラウザのみ）
  } catch {
    /* ignore */
  }
  let done = 0
  onProgress(0, paths.length)
  await fetchMany(paths, 6, () => onProgress(++done, paths.length), shouldStop)
  return cachedCount(words)
}

// iOS は同じ audio 要素を使い回すと自動再生が通りやすい
let audioEl: HTMLAudioElement | null = null
const getAudio = () => (audioEl ??= new Audio())

function playUrl(url: string, token: number): Promise<void> {
  return new Promise((resolve) => {
    if (token !== playToken) return resolve()
    const a = getAudio()
    const done = () => {
      a.onended = a.onerror = null
      URL.revokeObjectURL(url)
      resolve()
    }
    a.onended = done
    a.onerror = done
    a.src = url
    a.play().catch(done)
  })
}

let playToken = 0

/** 再生中の音声を止める */
export function stopSpeaking() {
  playToken++
  if (audioEl) {
    audioEl.pause()
    audioEl.onended = audioEl.onerror = null
  }
  if (canSpeak()) speechSynthesis.cancel()
}

async function playClips(w: Word, kinds: ClipKind[]) {
  stopSpeaking()
  const token = playToken
  await loadReady()
  const { voice } = getSettings()
  const useFiles = !!ready?.[voice]
  // 続けて鳴らす音声（英語→日本語）は最初に全部まとめて取りに行く（1つずつ待たない）
  const blobs = kinds.map((k) => (useFiles && clipText(w, k) ? fetchClip(clipPath(voice, w.id, k)) : Promise.resolve(null)))
  for (const [i, kind] of kinds.entries()) {
    if (token !== playToken) return
    const c = clipText(w, kind)
    if (!c) continue
    const blob = await blobs[i]
    const url = blob ? URL.createObjectURL(blob) : null
    if (token !== playToken) return
    if (url) await playUrl(url, token)
    else await synthSpeak(kind === 'w' ? w.word.replace(/[()～~]/g, ' ') : c.text, c.lang)
    if (kinds.length > 1) await new Promise((r) => setTimeout(r, 250))
  }
}

/**
 * 単語を再生。withJa=true かつ設定で日本語読み上げがオンなら、意味も続けて読む。
 * （クイズの出題中は答えが分かってしまうので withJa=false で呼ぶ）
 */
export function playWord(w: Word, withJa = true) {
  return playClips(w, withJa && getSettings().readJa ? ['w', 'wj'] : ['w'])
}

/** 例文を再生（設定がオンなら和訳も） */
export function playExample(w: Word, withJa = true) {
  return playClips(w, withJa && getSettings().readJa ? ['e', 'ej'] : ['e'])
}

/** 単語以外の英語（活用形など）を読む */
export function speak(text: string) {
  stopSpeaking()
  void synthSpeak(text, 'en-US')
}

/** 端末に保存した音声を消す（設定画面から） */
export async function clearAudioCache() {
  memo.clear()
  try {
    await caches.delete(CACHE)
  } catch {
    /* ignore */
  }
}
