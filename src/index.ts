import { createServer } from "./infrastructure/web/server";
import { env } from "./config/env";

process.env.TZ = env.TIME_ZONE;

const startServer = () => {

  const app = createServer();
  const PORT = env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
