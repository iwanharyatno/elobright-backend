import { Request, Response } from 'express';
import { StoreAudioTelemetry } from '../../use-cases/audio-telemetry/StoreAudioTelemetry';

export class AudioTelemetryController {
    constructor(private storeAudioTelemetry: StoreAudioTelemetry) {}

    store = async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId, examSessionId, configuration, audio_url, total_size, timestamp, metrics } = req.body;

            if (!userId || !examSessionId || !audio_url) {
                res.status(400).json({ error: 'userId, examSessionId, and audio_url are required' });
                return;
            }

            const telemetryData = {
                userId,
                examSessionId,
                configuration,
                audioUrl: audio_url,
                totalSize: total_size,
                timestamp,
                metrics
            };

            const result = await this.storeAudioTelemetry.execute(telemetryData);
            res.status(201).json({ message: 'Telemetry stored successfully', data: result });
        } catch (error: any) {
            console.error('Error storing telemetry:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }
}
