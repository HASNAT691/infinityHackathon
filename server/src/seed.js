import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from './db.js';
import { User } from './models.js';

const PASSWORD = 'Demo123!';

const accounts = [
  ['ADMIN', 'Admin', 'admin@novaworks.example', 'ADMIN', 'Administrator', ['Company overview', 'transcript creation']],
  ['PM01', 'Ayesha Khan', 'ayesha@novaworks.example', 'MANAGER', 'Web PM', ['Web projects', 'client coordination']],
  ['PM02', 'Bilal Ahmed', 'bilal@novaworks.example', 'MANAGER', 'Mobile PM', ['Mobile projects', 'delivery planning']],
  ['PM03', 'Hina Malik', 'hina@novaworks.example', 'MANAGER', 'AI PM', ['AI projects', 'requirement review']],
  ['DEV01', 'Ali Raza', 'ali@novaworks.example', 'AGENT', 'Full-Stack', ['React', 'frontend integration']],
  ['DEV02', 'Hamza Shah', 'hamza@novaworks.example', 'AGENT', 'Full-Stack', ['Node.js', 'databases', 'APIs']],
  ['DEV03', 'Sara Noor', 'sara@novaworks.example', 'AGENT', 'App Developer', ['Flutter', 'mobile UI']],
  ['DEV04', 'Usman Tariq', 'usman@novaworks.example', 'AGENT', 'App Developer', ['Flutter', 'integration', 'testing']],
  ['DEV05', 'Zain Abbas', 'zain@novaworks.example', 'AGENT', 'AI Developer', ['LLMs', 'extraction', 'prompts']],
  ['DEV06', 'Maryam Asif', 'maryam@novaworks.example', 'AGENT', 'AI Developer', ['Retrieval', 'document processing']],
];

await connectDB();
const passwordHash = await bcrypt.hash(PASSWORD, 10);
for (const [ref, name, email, role, specialization, skills] of accounts) {
  // Upsert by unique email: re-running never duplicates users.
  await User.updateOne(
    { email },
    { $set: { ref, name, email, role, specialization, skills, passwordHash } },
    { upsert: true },
  );
}
console.log(`Seeded ${accounts.length} users (total in DB: ${await User.countDocuments()})`);
await mongoose.disconnect();
