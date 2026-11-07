import { createApiApp } from "../server/app";

const app = createApiApp();

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false,
  },
};

export default app;
