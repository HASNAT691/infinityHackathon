// Local / long-running server entry. On Vercel, api/index.js exports the same app instead.
import { app } from './app.js';
import { connectDB } from './db.js';

const PORT = process.env.PORT || 5000;
await connectDB();
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
