import { useEffect, useState } from 'react'
import { lastSeen, markSeen, newsFor } from '../changelog'
import { ArrowLeft } from '../icons'

const day = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return `${y}年${m}月${dd}日`
}

/** お知らせ（アプリの改善の記録） */
export function News({ admin, onBack }: { admin: boolean; onBack: () => void }) {
  const list = newsFor(admin)
  // 開いた時点で「前回どこまで見たか」を覚えておき、それより新しいものに NEW を付ける
  const [seen] = useState(lastSeen)
  useEffect(() => markSeen(admin), [admin])
  const seenIdx = seen ? list.findIndex((e) => e.id === seen) : 1 // 初めての人は最新の1件だけ NEW

  return (
    <div className="news">
      <div className="list-top">
        <button className="ghost" onClick={onBack}>
          <ArrowLeft size={18} /> 戻る
        </button>
        <h2>お知らせ</h2>
      </div>
      {list.map((e, i) => (
        <article key={e.id} className="news-entry">
          <div className="news-head">
            <time dateTime={e.date}>{day(e.date)}</time>
            {(seenIdx < 0 || i < seenIdx) && <span className="badge warn">NEW</span>}
          </div>
          <h3>{e.title}</h3>
          <ul>
            {e.items.map((it, k) => (
              <li key={k}>
                {it.audience === 'teacher' && <span className="badge">講師</span>} {it.text}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
