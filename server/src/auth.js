import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

const COOKIE = 'session';

export function publicUser(u) {
  return { id: u._id, ref: u.ref, name: u.name, email: u.email, role: u.role, specialization: u.specialization, skills: u.skills };
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  const user = email && await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  // The token only carries the user id; role is always re-read from the DB.
  const token = jwt.sign({ uid: user._id.toString() }, process.env.SESSION_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 3600 * 1000 });
  res.json({ user: publicUser(user) });
}

export function logout(req, res) {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
}

// Middleware: current user comes from the signed session cookie, never from the request body.
export async function requireAuth(req, res, next) {
  try {
    const { uid } = jwt.verify(req.cookies[COOKIE], process.env.SESSION_SECRET);
    const user = await User.findById(uid);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Not logged in' });
  }
}

export function requireRole(role) {
  return (req, res, next) => req.user.role === role ? next() : res.status(403).json({ error: 'Forbidden' });
}
