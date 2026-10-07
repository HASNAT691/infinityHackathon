// SECURITY CORE: every project/task read goes through these functions.
// The role always comes from req.user (loaded from the session), never from the client.
import { Project, Task } from './models.js';

const managerFields = 'name ref specialization';

export async function getProjects(user) {
  let filter = {};
  if (user.role === 'MANAGER') filter = { managerId: user._id };
  if (user.role === 'AGENT') filter = { _id: { $in: await Task.distinct('projectId', { assigneeId: user._id }) } };
  const projects = await Project.find(filter).populate('managerId', managerFields).sort({ deadline: 1 }).lean();

  // Counts/hours per project, scoped to what this user is allowed to see.
  const visible = await getTasksFilter(user, projects.map(p => p._id));
  const stats = await Task.aggregate([
    { $match: visible },
    { $group: { _id: '$projectId', taskCount: { $sum: 1 }, totalHours: { $sum: '$estimatedHours' } } },
  ]);
  const byId = Object.fromEntries(stats.map(s => [s._id.toString(), s]));
  return projects.map(p => ({ ...shapeProject(p), taskCount: byId[p._id]?.taskCount || 0, totalHours: byId[p._id]?.totalHours || 0 }));
}

async function getTasksFilter(user, projectIds) {
  const f = { projectId: { $in: projectIds } };
  if (user.role === 'AGENT') f.assigneeId = user._id; // agents never see other agents' tasks
  return f;
}

export async function getProjectById(user, projectId) {
  const allowed = await getProjects(user);
  const project = allowed.find(p => p.id === projectId);
  if (!project) return null; // outside this user's scope -> caller returns 404
  const tasks = await Task.find(await getTasksFilter(user, [project.id]))
    .populate('assigneeId', 'name ref specialization').sort({ deadline: 1 }).lean();
  return { ...project, tasks: tasks.map(shapeTask) };
}

export async function getMyTasks(user) {
  const tasks = await Task.find({ assigneeId: user._id })
    .populate('assigneeId', 'name ref specialization').populate('projectId', 'name clientName deadline')
    .sort({ deadline: 1 }).lean();
  return tasks.map(t => ({ ...shapeTask(t), project: { id: t.projectId._id.toString(), name: t.projectId.name, clientName: t.projectId.clientName } }));
}

function shapeProject(p) {
  return { id: p._id.toString(), name: p.name, clientName: p.clientName, description: p.description, deadline: p.deadline, manager: p.managerId && { id: p.managerId._id, name: p.managerId.name, ref: p.managerId.ref } };
}

function shapeTask(t) {
  return { id: t._id.toString(), title: t.title, description: t.description, deadline: t.deadline, estimatedHours: t.estimatedHours, assignee: t.assigneeId && { id: t.assigneeId._id, name: t.assigneeId.name, ref: t.assigneeId.ref, specialization: t.assigneeId.specialization } };
}
