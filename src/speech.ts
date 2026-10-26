/**
 * 音声の再生。
 * 1. Supabase Storage（非公開バケット audio）に生成済みの音声があればそれを再生（端末にキャッシュ）
 * 2. なければブラウザ標準の読み上げ（Web Speech API）で代用
 */
import { type ClipKind, clipPath, clipText } from './audioText'
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
const CACHE = 'audio-v1'
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

async function clipUrl(path: string): Promise<string | null> {
  const key = new Request(`${location.origin}/__audio__/${path}`)
  try {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(key)
    if (hit) return URL.createObjectURL(await hit.blob())
    if (!supabase || !navigator.onLine) return null
    const { data } = await supabase.storage.from('audio').download(path)
    if (!data) return null
    await cache.put(key, new Response(data, { headers: { 'content-type': 'audio/mpeg' } }))
    return URL.createObjectURL(data)
  } catch {
    try {
      if (!supabase) return null
      const { data } = await supabase.storage.from('audio').download(path)
      return data ? URL.createObjectURL(data) : null
    } catch {
      return null
    }
  }
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
  for (const kind of kinds) {
    if (token !== playToken) return
    const c = clipText(w, kind)
    if (!c) continue
    const url = useFiles ? await clipUrl(clipPath(voice, w.id, kind)) : null
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
  try {
    await caches.delete(CACHE)
  } catch {
    /* ignore */
  }
}
