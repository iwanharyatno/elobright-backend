import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { authRoutes } from "./routes/authRoutes";
import { examRoutes } from "./routes/examRoutes";
import { examSectionRoutes } from "./routes/examSectionRoutes";
import { questionRoutes } from "./routes/questionRoutes";
import { questionOptionRoutes } from "./routes/questionOptionRoutes";
import { examSubmissionRoutes } from "./routes/examSubmissionRoutes";
import { errorHandler } from "./middleware/errorHandler";

export const createServer = () => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Serve uploaded files statically at /uploads
  // Override Helmet's Cross-Origin-Resource-Policy so browsers on other origins
  // (e.g. a separate frontend) can load images and audio files directly.
  app.use(
    "/uploads",
    (req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(path.join(__dirname, "../../../uploads")),
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/exams", examRoutes);
  app.use("/api/exam-sections", examSectionRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/question-options", questionOptionRoutes);
  app.use("/api/exam-sessions", examSubmissionRoutes);

  // Error Handling Middlewareck
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(errorHandler);

  return app;
};
