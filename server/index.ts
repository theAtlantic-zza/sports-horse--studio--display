import path from "node:path";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT || 4001);
const app = await createApp(path.resolve(process.env.DATA_DIR || "data"));
app.listen(port, "127.0.0.1", () =>
  console.log(`EQUIVISION demo → http://127.0.0.1:${port}`),
);
