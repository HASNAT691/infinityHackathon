import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// "ref" is the human-readable directory id (ADMIN, PM01, DEV01...) that the AI uses.
const userSchema = new Schema({
  ref: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'MANAGER', 'AGENT'], required: true },
  specialization: String,
  skills: [String],
});

const projectSchema = new Schema({
  name: { type: String, required: true },
  clientName: { type: String, required: true },
  description: String,
  managerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  deadline: { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });

const taskSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  title: { type: String, required: true },
  description: String,
  assigneeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deadline: { type: String, required: true },
  estimatedHours: { type: Number, required: true, min: 0.1 },
}, { timestamps: true });

export const User = model('User', userSchema);
export const Project = model('Project', projectSchema);
export const Task = model('Task', taskSchema);
