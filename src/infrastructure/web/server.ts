import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRoutes } from './routes/authRoutes';
import { errorHandler } from './middleware/errorHandler';

export const createServer = () => {
    const app = express();

    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    app.use('/api/auth', authRoutes);

    // Health check
    app.get('/health', (req, res) => {
        res.status(200).json({ status: 'ok' });
    });

    app.use(errorHandler);

    return app;
};
