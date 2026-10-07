import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMyTasks, getProjectById, getProjects } from './access.js';
import { login, logout, publicUser, requireAuth, requireRole } from './auth.js';
import { connectDB } from './db.js';
import { Project, Task, User } from './models.js';
import { createFromTranscript } from './transcript.js';

export const app = express();
app.use(express.json({ limit: '1mb' }));
// Serverless-friendly: ensure the (cached) DB connection exists before any request.
app.use(async (req, res, next) => { try { await connectDB(); next(); } catch (e) { next(e); } });
app.use(cookieParser());

app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

// Read-only team directory (no emails needed for display, never password hashes).
app.get('/api/team', requireAuth, async (req, res) => {
  const users = await User.find({}, 'ref name role specialization skills').sort({ ref: 1 }).lean();
  res.json(users.map(u => ({ id: u._id, ref: u.ref, name: u.name, role: u.role, specialization: u.specialization, skills: u.skills })));
});

app.get('/api/projects', requireAuth, async (req, res) => res.json(await getProjects(req.user)));

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Project not found' });
  const project = await getProjectById(req.user, req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found or not accessible' });
  res.json(project);
});

app.get('/api/my-tasks', requireAuth, async (req, res) => res.json(await getMyTasks(req.user)));

app.post('/api/transcript', requireAuth, requireRole('ADMIN'), createFromTranscript);

// Demo helper: load the supplied / modified sample transcript into the textarea.
const samplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sample');
app.get('/api/samples/:name', requireAuth, requireRole('ADMIN'), async (req, res) => {
  if (!['transcript', 'transcript-modified'].includes(req.params.name)) return res.status(404).json({ error: 'Unknown sample' });
  res.json({ text: await fs.readFile(path.join(samplesDir, `${req.params.name}.txt`), 'utf8') });
});

// Demo helper: wipe generated projects/tasks, keep seeded users.
app.post('/api/admin/reset', requireAuth, requireRole('ADMIN'), async (req, res) => {
  await Task.deleteMany({});
  await Project.deleteMany({});
  res.json({ ok: true });
});

// In production, serve the built React app from the same origin.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(dist));
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
