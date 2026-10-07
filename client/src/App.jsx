import { useEffect, useState } from 'react'
import { api } from './api'

// --- tiny router (pushState) so refresh keeps the current page ---
function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const go = (to) => { window.history.pushState({}, '', to); setPath(to) }
  return [path, go]
}

function Link({ to, go, children, className }) {
  return <a href={to} className={className} onClick={(e) => { e.preventDefault(); go(to) }}>{children}</a>
}

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function useLoad(path, deps = []) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    api(path).then((data) => alive && setState({ data })).catch((error) => alive && setState({ error }))
    return () => { alive = false }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

export default function App() {
  const [path, go] = usePath()
  const [user, setUser] = useState(undefined)

  useEffect(() => { api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)) }, [])

  if (user === undefined) return <div className="center muted">Loading…</div>
  if (!user) return <Login onLogin={(u) => { setUser(u); go('/') }} />

  const logout = async () => { await api('/auth/logout', { body: {} }); setUser(null); go('/') }

  let page
  const m = path.match(/^\/projects\/([a-f0-9]+)$/)
  if (m) page = <ProjectDetail id={m[1]} go={go} user={user} />
  else if (path === '/team') page = <Team />
  else if (path === '/tasks') page = <MyTasks go={go} />
  else if (path === '/transcript' && user.role === 'ADMIN') page = <Transcript go={go} />
  else page = <Home user={user} go={go} />

  return (
    <div>
      <header className="nav">
        <Link to="/" go={go} className="brand">NovaWorks <span>CRM</span></Link>
        <nav>
          <Link to="/" go={go}>{user.role === 'AGENT' ? 'My Projects' : 'Projects'}</Link>
          {user.role === 'AGENT' && <Link to="/tasks" go={go}>My Tasks</Link>}
          {user.role === 'ADMIN' && <Link to="/transcript" go={go}>Create from Transcript</Link>}
          <Link to="/team" go={go}>Team</Link>
        </nav>
        <div className="who">
          <span>{user.name}</span>
          <span className={`badge ${user.role}`}>{user.role}</span>
          <button className="ghost" onClick={logout}>Logout</button>
        </div>
      </header>
      <main>{page}</main>
    </div>
  )
}

const DEMO = [
  ['Admin', 'admin'], ['Ayesha (PM)', 'ayesha'], ['Bilal (PM)', 'bilal'], ['Hina (PM)', 'hina'],
  ['Ali', 'ali'], ['Hamza', 'hamza'], ['Sara', 'sara'], ['Usman', 'usman'], ['Zain', 'zain'], ['Maryam', 'maryam'],
]

function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    try { onLogin((await api('/auth/login', { body: { email, password } })).user) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>NovaWorks <span>CRM</span></h1>
        <p className="muted">Meeting → projects & tasks, powered by AI</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@novaworks.example" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo">
          <div className="muted small">Demo accounts (password Demo123!)</div>
          {DEMO.map(([label, u]) => (
            <button type="button" key={u} className="chip" onClick={() => { setEmail(`${u}@novaworks.example`); setPassword('Demo123!') }}>{label}</button>
          ))}
        </div>
      </form>
    </div>
  )
}

function Status({ state }) {
  if (state.loading) return <p className="muted">Loading…</p>
  if (state.error) return <div className="error">{state.error.message}</div>
  return null
}

function Home({ user, go }) {
  const state = useLoad('/projects', [user.id])
  const [resetting, setResetting] = useState(false)
  const projects = state.data || []
  const titles = { ADMIN: 'All projects', MANAGER: 'My projects', AGENT: 'Projects I work on' }

  const reset = async () => {
    if (!confirm('Delete all generated projects and tasks? Users are kept.')) return
    setResetting(true)
    await api('/admin/reset', { body: {} })
    window.location.reload()
  }

  return (
    <section>
      <div className="row">
        <h2>{titles[user.role]}</h2>
        {user.role === 'ADMIN' && (
          <div className="actions">
            <button className="ghost" onClick={reset} disabled={resetting}>Reset demo data</button>
            <button onClick={() => go('/transcript')}>+ Create from Transcript</button>
          </div>
        )}
      </div>
      <Status state={state} />
      {state.data && !projects.length && (
        <div className="card empty">No projects yet.{user.role === 'ADMIN' && ' Paste a meeting transcript to create them.'}</div>
      )}
      <div className="grid">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} go={go} className="card project">
            <h3>{p.name}</h3>
            <div className="muted">{p.clientName}</div>
            <div className="meta">
              <span>👤 {p.manager?.name}</span>
              <span>📅 {fmtDate(p.deadline)}</span>
            </div>
            <div className="meta">
              <span className="pill">{p.taskCount} {user.role === 'AGENT' ? 'my ' : ''}tasks</span>
              <span className="pill">{p.totalHours} h</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function TaskTable({ tasks, showProject, go }) {
  return (
    <table>
      <thead>
        <tr>
          {showProject && <th>Project</th>}
          <th>Task</th><th>Assigned agent</th><th>Deadline</th><th className="num">Est. hours</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id}>
            {showProject && <td><Link to={`/projects/${t.project.id}`} go={go}>{t.project.name}</Link></td>}
            <td><strong>{t.title}</strong><div className="muted small">{t.description}</div></td>
            <td>{t.assignee?.name}<div className="muted small">{t.assignee?.specialization}</div></td>
            <td className="nowrap">{fmtDate(t.deadline)}</td>
            <td className="num">{t.estimatedHours}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ProjectDetail({ id, go, user }) {
  const state = useLoad(`/projects/${id}`, [id])
  const p = state.data
  return (
    <section>
      <Link to="/" go={go} className="back">← Back</Link>
      <Status state={state} />
      {p && (
        <>
          <div className="card">
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <div className="facts">
              <div><span className="muted small">Client</span>{p.clientName}</div>
              <div><span className="muted small">Manager</span>{p.manager?.name}</div>
              <div><span className="muted small">Deadline</span>{fmtDate(p.deadline)}</div>
              <div><span className="muted small">{user.role === 'AGENT' ? 'My tasks' : 'Tasks'}</span>{p.tasks.length} · {p.tasks.reduce((s, t) => s + t.estimatedHours, 0)} h</div>
            </div>
          </div>
          {user.role === 'AGENT' && <p className="muted small">You only see tasks assigned to you.</p>}
          <TaskTable tasks={p.tasks} />
        </>
      )}
    </section>
  )
}

function MyTasks({ go }) {
  const state = useLoad('/my-tasks')
  const tasks = state.data || []
  return (
    <section>
      <h2>My Tasks</h2>
      <Status state={state} />
      {state.data && !tasks.length && <div className="card empty">No tasks assigned to you yet.</div>}
      {tasks.length > 0 && <TaskTable tasks={tasks} showProject go={go} />}
    </section>
  )
}

function Team() {
  const state = useLoad('/team')
  return (
    <section>
      <h2>Team directory</h2>
      <Status state={state} />
      <div className="grid">
        {(state.data || []).map((u) => (
          <div key={u.id} className="card">
            <div className="row"><strong>{u.name}</strong><span className={`badge ${u.role}`}>{u.role}</span></div>
            <div className="muted">{u.specialization}</div>
            <div className="small">{u.skills?.join(' · ')}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Transcript({ go }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const loadSample = async (name) => setText((await api(`/samples/${name}`)).text)

  const create = async () => {
    setBusy(true); setResult(null)
    try { setResult(await api('/transcript', { body: { transcript: text } })) }
    catch (err) { setResult(err.data?.errors ? err.data : { ok: false, errors: [{ path: '', message: err.message }] }) }
    finally { setBusy(false) }
  }

  return (
    <section>
      <div className="row">
        <h2>Create from Transcript</h2>
        <div className="actions">
          <button className="ghost" onClick={() => loadSample('transcript')} disabled={busy}>Load supplied transcript</button>
          <button className="ghost" onClick={() => loadSample('transcript-modified')} disabled={busy}>Load modified transcript</button>
        </div>
      </div>
      <p className="muted">Paste the meeting transcript. AI extracts projects and tasks using the team directory, the server validates everything, then saves it all at once (or nothing).</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste meeting transcript here…" rows={14} disabled={busy} />
      <div className="row">
        <span className="muted small">{text.length.toLocaleString()} characters</span>
        <button onClick={create} disabled={busy || !text.trim()}>
          {busy ? <><span className="spinner" /> AI is reading the meeting…</> : 'Create from Transcript'}
        </button>
      </div>

      {result?.ok && (
        <div className="card success">
          <h3>✅ Created {result.projects.length} projects with {result.projects.reduce((s, p) => s + p.taskCount, 0)} tasks</h3>
          <ul>
            {result.projects.map((p) => (
              <li key={p.id}><Link to={`/projects/${p.id}`} go={go}>{p.name}</Link> — {p.taskCount} tasks, {p.totalHours} h</li>
            ))}
          </ul>
          <div className="muted small">Model: {result.model} · {(result.ms / 1000).toFixed(1)}s</div>
        </div>
      )}
      {result && !result.ok && (
        <div className="card failure">
          <h3>⚠️ Nothing was saved. Please fix these issues and try again:</h3>
          <ul>{result.errors.map((e, i) => <li key={i}>{e.path && <code>{e.path}</code>} {e.message}</li>)}</ul>
          {result.draft && (
            <details><summary>Show AI draft</summary><pre>{JSON.stringify(result.draft, null, 2)}</pre></details>
          )}
        </div>
      )}
    </section>
  )
}
