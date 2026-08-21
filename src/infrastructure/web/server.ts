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
import { audioTelemetryRoutes } from "./routes/audioTelemetryRoutes";
import { certificationAdditionalScoreRoutes } from "./routes/certificationAdditionalScoreRoutes";
import { certificationScoreRoutes } from "./routes/certificationScoreRoutes";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimit } from "./middleware/rateLimiter";
import { requestLogger } from "../logger";

export const createServer = () => {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(cors());
  app.use(express.json());

  // Request logging middleware
  app.use(requestLogger);

  // Serve uploaded files statically at /uploads
  // Override Helmet's Cross-Origin-Resource-Policy so browsers on other origins
  // (e.g. a separate frontend) can load images and audio files directly.
  // app.use(
  //   "/uploads",
  //   express.static(path.join(__dirname, "../../../uploads"))
  // );

  // General rate limiting for all routes (including non-API)
  app.use(rateLimit({ windowMs: 60_000, max: 200, message: 'Too many requests, please try again later.' }));

  // Stricter rate limiting for API routes
  app.use('/api', rateLimit({ windowMs: 60_000, max: 120, message: 'Too many requests, please try again later.' }));

  app.use("/api/auth", authRoutes);
  app.use("/api/exams", examRoutes);
  app.use("/api/exam-sections", examSectionRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/question-options", questionOptionRoutes);
  app.use("/api/exam-sessions", examSubmissionRoutes);
  app.use("/api/audio-telemetry", audioTelemetryRoutes);
  app.use("/api/certification-additional-scores", certificationAdditionalScoreRoutes);
  app.use("/api/certification-scores", certificationScoreRoutes);

  // Error Handling Middleware
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(errorHandler);

  return app;
};
