// Vercel serverless entry: every /api/* request is rewritten here and handled by the Express app.
import { app } from '../server/src/app.js';

export default app;
