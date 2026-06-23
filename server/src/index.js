import './db.js'; // initialise + seed
import { createApp } from './app.js';

const PORT = process.env.PORT || 4000;
const app = createApp();
app.listen(PORT, () => {
  console.log(`[server] PO & Invoice Tracker API listening on http://localhost:${PORT}`);
});
