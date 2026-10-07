import 'dotenv/config';
import mongoose from 'mongoose';

// Reuse one connection per process (important for serverless, where modules stay warm between requests).
let connecting;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  connecting ??= mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => console.log('MongoDB connected'))
    .catch((e) => { connecting = undefined; throw e; });
  await connecting;
}
