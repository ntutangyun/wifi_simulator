import { useEffect, useState } from 'react'
import { useStrings } from '../ui/i18n'
import { player, useUi } from '../ui/store'
import { LESSONS, MODULES, lessonIndex, type Lesson } from './lessons'

type Progress = Record<string, { done?: boolean; obs?: number[] }>

const LS_KEY = 'wifi-sim.course'

function loadProgress(): Progress {
  try {
    const s = localStorage.getItem(LS_KEY)
    if (s) return JSON.parse(s) as Progress
  } catch {
    // fresh start
  }
  return {}
}

const h4: React.CSSProperties = { margin: '12px 0 4px', fontSize: 12, color: '#d5dae3' }
const dim: React.CSSProperties = { color: 'var(--dim)' }

export function CoursePanel() {
  const { lang, courseLessonId, selectLesson, loadCourseScenario, adoptCourseScenario, courseLoaded } = useUi()
  const L = useStrings().course
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [jumpMsg, setJumpMsg] = useState('')
  const [quizPick, setQuizPick] = useState<Record<number, number>>({})
  const [quizResult, setQuizResult] = useState<Record<number, boolean>>({})

  const t = (l: { en: string; zh: string }) => l[lang]

  const save = (p: Progress) => {
    setProgress(p)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(p))
    } catch {
      // non-persistent
    }
  }

  const lesson = courseLessonId ? LESSONS.find((l) => l.id === courseLessonId) ?? null : null

  // reset transient lesson state on lesson change
  useEffect(() => {
    setJumpMsg('')
    setQuizPick({})
    setQuizResult({})
  }, [courseLessonId])

  const doneCount = LESSONS.filter((l) => progress[l.id]?.done).length

  if (!lesson) {
    return (
      <div style={{ padding: 12, overflowY: 'auto', fontSize: 12.5 }}>
        <h3 style={{ margin: '2px 0 2px', fontSize: 14 }}>{L.title}</h3>
        <div style={{ ...dim, marginBottom: 10 }}>{L.progressOf(doneCount, LESSONS.length)}</div>
        <div style={{ ...dim, marginBottom: 12, lineHeight: 1.5 }}>{L.selectPrompt}</div>
        {MODULES.map((m, mi) => (
          <div key={mi} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--dim)', letterSpacing: 0.5, marginBottom: 4 }}>
              {L.module} {mi + 1} · {t(m)}
            </div>
            {LESSONS.filter((l) => l.module === mi).map((l) => (
              <div
                key={l.id}
                onClick={() => selectLesson(l.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'pointer',
                  borderRadius: 4, marginBottom: 2, background: 'var(--panel2)',
                }}
              >
                <span style={{ width: 14, textAlign: 'center', color: progress[l.id]?.done ? '#22c55e' : 'var(--dim)' }}>
                  {progress[l.id]?.done ? '✓' : '○'}
                </span>
                <span style={{ flex: 1 }}>{t(l.title)}</span>
                <span style={{ ...dim, fontSize: 10.5 }}>{L.minutes(l.minutes)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const idx = lessonIndex(lesson.id)
  const obs = new Set(progress[lesson.id]?.obs ?? [])
  const toggleObs = (i: number) => {
    const next = new Set(obs)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    save({ ...progress, [lesson.id]: { ...progress[lesson.id], obs: [...next] } })
  }

  const jump = (find: Lesson['jumps'][0]['find'], label: string) => {
    const ok = player.seekFirst(find)
    setJumpMsg(ok ? '' : `${label}: ${L.notFound}`)
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button onClick={() => selectLesson(null)}>{L.back}</button>
        <button disabled={idx <= 0} onClick={() => selectLesson(LESSONS[idx - 1].id)}>{L.prev}</button>
        <button disabled={idx >= LESSONS.length - 1} onClick={() => selectLesson(LESSONS[idx + 1].id)}>{L.next}</button>
      </div>

      <h3 style={{ margin: '4px 0 8px', fontSize: 14 }}>{t(lesson.title)}</h3>

      {lesson.body.map((b, i) => (
        <div key={i}>
          {b.heading && <h4 style={h4}>{t(b.heading)}</h4>}
          <p style={{ margin: '4px 0', color: '#c3c9d4' }}>{t(b.text)}</p>
        </div>
      ))}

      <div style={{ margin: '10px 0 4px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          className="active"
          style={{ padding: '6px 10px' }}
          title={L.loadHint}
          onClick={() => loadCourseScenario(lesson.scenario())}
        >
          {courseLoaded ? L.reload : L.load}
        </button>
        {lesson.variants?.map((v, i) => (
          <button key={i} onClick={() => loadCourseScenario(v.scenario())}>
            {L.variants}: {t(v.label)}
          </button>
        ))}
        <button onClick={() => adoptCourseScenario(lesson.scenario())} style={{ fontSize: 11.5 }}>
          {L.openInEditor}
        </button>
      </div>

      {courseLoaded && lesson.jumps.length > 0 && (
        <div style={{ margin: '8px 0' }}>
          <div style={{ ...dim, fontSize: 11, marginBottom: 3 }}>{L.jumps}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {lesson.jumps.map((j, i) => (
              <button key={i} style={{ fontSize: 11.5 }} onClick={() => jump(j.find, t(j.label))}>
                ⚡ {t(j.label)}
              </button>
            ))}
          </div>
          {jumpMsg && <div style={{ color: '#eab308', fontSize: 11, marginTop: 3 }}>{jumpMsg}</div>}
        </div>
      )}

      <h4 style={h4}>{L.observe}</h4>
      {lesson.observe.map((o, i) => (
        <label key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '3px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={obs.has(i)} onChange={() => toggleObs(i)} style={{ marginTop: 3 }} />
          <span style={{ color: obs.has(i) ? '#8a93a3' : '#c3c9d4', textDecoration: obs.has(i) ? 'line-through' : 'none' }}>
            {t(o)}
          </span>
        </label>
      ))}

      <h4 style={h4}>{L.tryThis}</h4>
      <ul style={{ margin: '2px 0', paddingLeft: 18, color: '#c3c9d4' }}>
        {lesson.tryThis.map((x, i) => (
          <li key={i} style={{ marginBottom: 3 }}>{t(x)}</li>
        ))}
      </ul>

      <h4 style={h4}>{L.quiz}</h4>
      {lesson.quiz.map((q, qi) => (
        <div key={qi} style={{ margin: '6px 0 10px', padding: 8, background: 'var(--panel2)', borderRadius: 5 }}>
          <div style={{ marginBottom: 4 }}>{t(q.q)}</div>
          {q.options.map((o, oi) => (
            <label key={oi} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '2px 0', cursor: 'pointer', fontSize: 12 }}>
              <input
                type="radio"
                name={`quiz-${lesson.id}-${qi}`}
                checked={quizPick[qi] === oi}
                onChange={() => setQuizPick({ ...quizPick, [qi]: oi })}
                style={{ marginTop: 3 }}
              />
              <span>{t(o)}</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <button
              disabled={quizPick[qi] === undefined}
              onClick={() => setQuizResult({ ...quizResult, [qi]: quizPick[qi] === q.answer })}
            >
              {L.check}
            </button>
            {quizResult[qi] === true && <span style={{ color: '#22c55e', fontSize: 12 }}>{L.correct} {t(q.explain)}</span>}
            {quizResult[qi] === false && <span style={{ color: '#f87171', fontSize: 12 }}>{L.incorrect} {t(q.explain)}</span>}
          </div>
        </div>
      ))}

      <button
        className={progress[lesson.id]?.done ? 'active' : ''}
        style={{ margin: '6px 0 16px', padding: '6px 10px' }}
        onClick={() => save({ ...progress, [lesson.id]: { ...progress[lesson.id], done: !progress[lesson.id]?.done } })}
      >
        {progress[lesson.id]?.done ? L.done : L.markDone}
      </button>
    </div>
  )
}
