import mongoose from 'mongoose';
import { z } from 'zod';
import { extractPlan } from './ai.js';
import { Project, Task, User } from './models.js';

const draftSchema = z.object({
  projects: z.array(z.object({
    name: z.string().nullish(),
    clientName: z.string().nullish(),
    description: z.string().nullish(),
    managerId: z.string().nullish(),
    deadline: z.string().nullish(),
    tasks: z.array(z.object({
      title: z.string().nullish(),
      description: z.string().nullish(),
      assigneeId: z.string().nullish(),
      deadline: z.string().nullish(),
      estimatedHours: z.coerce.number().nullish(),
    })).default([]),
  })).min(1, 'AI found no projects'),
  issues: z.array(z.string()).nullish(),
});

const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

// Never trust the model: check every reference, date and number. Collect ALL errors.
export function validateDraft(draft, users) {
  const errors = [];
  // Free models sometimes leak stray strings (e.g. "issues") into arrays; keep only real objects.
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (Array.isArray(draft?.projects)) {
    draft = { ...draft, projects: draft.projects.filter(isObj).map(p => ({ ...p, tasks: Array.isArray(p.tasks) ? p.tasks.filter(isObj) : p.tasks })) };
  }
  if (draft && !Array.isArray(draft.issues)) draft.issues = [];
  // Models sometimes return issues as objects ({ issue: "..." }); turn them into readable text.
  if (draft) draft.issues = draft.issues.map(x => typeof x === 'string' ? x
    : (isObj(x) && Object.values(x).find(v => typeof v === 'string')) || JSON.stringify(x));
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) };
  }
  const byRef = Object.fromEntries(users.map(u => [u.ref, u]));
  const data = parsed.data;
  (data.issues || []).forEach(msg => errors.push({ path: 'AI', message: msg }));

  data.projects.forEach((p, i) => {
    const at = `projects[${i}] (${p.name || 'unnamed'})`;
    if (!p.name?.trim()) errors.push({ path: `${at}.name`, message: 'Project name is missing' });
    if (!p.clientName?.trim()) errors.push({ path: `${at}.clientName`, message: 'Client name is missing' });
    if (byRef[p.managerId]?.role !== 'MANAGER') errors.push({ path: `${at}.managerId`, message: p.managerId ? `"${p.managerId}" is not an existing manager` : "Manager could not be matched to anyone in the team directory" });
    if (!isDate(p.deadline)) errors.push({ path: `${at}.deadline`, message: `Invalid project deadline "${p.deadline}"` });
    if (!p.tasks.length) errors.push({ path: `${at}.tasks`, message: 'Project has no tasks' });

    p.tasks.forEach((t, j) => {
      const tat = `${at}.tasks[${j}] (${t.title || 'untitled'})`;
      if (!t.title?.trim()) errors.push({ path: `${tat}.title`, message: 'Task title is missing' });
      if (byRef[t.assigneeId]?.role !== 'AGENT') errors.push({ path: `${tat}.assigneeId`, message: t.assigneeId ? `"${t.assigneeId}" is not an existing agent` : "Assignee could not be matched to anyone in the team directory" });
      if (!(t.estimatedHours > 0)) errors.push({ path: `${tat}.estimatedHours`, message: 'Estimated hours must be a positive number' });
      if (!isDate(t.deadline)) errors.push({ path: `${tat}.deadline`, message: `Invalid task deadline "${t.deadline}"` });
      else if (isDate(p.deadline) && t.deadline > p.deadline) errors.push({ path: `${tat}.deadline`, message: `Task deadline ${t.deadline} is after project deadline ${p.deadline}` });
    });
  });
  return { errors, data };
}

// All-or-nothing save: a MongoDB transaction (needs a replica set / Atlas).
export async function saveDraft(data, users) {
  const byRef = Object.fromEntries(users.map(u => [u.ref, u]));
  const session = await mongoose.startSession();
  const created = [];
  try {
    await session.withTransaction(async () => {
      created.length = 0;
      for (const p of data.projects) {
        const [project] = await Project.create([{
          name: p.name.trim(), clientName: p.clientName.trim(), description: p.description || '',
          managerId: byRef[p.managerId]._id, deadline: p.deadline,
        }], { session });
        await Task.insertMany(p.tasks.map(t => ({
          projectId: project._id, title: t.title.trim(), description: t.description || '',
          assigneeId: byRef[t.assigneeId]._id, deadline: t.deadline, estimatedHours: t.estimatedHours,
        })), { session });
        created.push({ id: project._id.toString(), name: project.name, taskCount: p.tasks.length, totalHours: p.tasks.reduce((s, t) => s + t.estimatedHours, 0) });
      }
    });
  } finally {
    await session.endSession();
  }
  return created;
}

let busy = false; // server-side guard against double submits

export async function createFromTranscript(req, res) {
  const transcript = String(req.body?.transcript || '').trim();
  if (!transcript) return res.status(400).json({ ok: false, errors: [{ path: 'transcript', message: 'Transcript is empty' }] });
  if (busy) return res.status(409).json({ ok: false, errors: [{ path: 'request', message: 'A transcript is already being processed' }] });
  busy = true;
  try {
    const users = await User.find().lean();
    // Directory sent to the AI: no emails, no password hashes.
    const directory = users.map(u => ({ id: u.ref, name: u.name, role: u.role, specialization: u.specialization, skills: u.skills }));
    const { draft, model, ms } = await extractPlan(transcript, directory);
    const { errors, data } = validateDraft(draft, users);
    if (errors.length) return res.status(422).json({ ok: false, errors, draft, model });
    const projects = await saveDraft(data, users);
    res.json({ ok: true, projects, model, ms });
  } catch (e) {
    console.error(e);
    res.status(502).json({ ok: false, errors: [{ path: 'ai', message: e.message }] });
  } finally {
    busy = false;
  }
}
