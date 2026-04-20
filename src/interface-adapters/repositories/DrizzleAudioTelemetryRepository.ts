import { IAudioTelemetryRepository } from '../../domain/repositories/IAudioTelemetryRepository';
import { AudioTelemetry } from '../../domain/entities/AudioTelemetry';
import { db } from '../../infrastructure/database/db';
import { audioTelemetryTable } from '../../infrastructure/database/schema';

export class DrizzleAudioTelemetryRepository implements IAudioTelemetryRepository {
    async create(data: Omit<AudioTelemetry, 'id'>): Promise<AudioTelemetry> {
        const [telemetry] = await db.insert(audioTelemetryTable).values(data).returning();
        return telemetry as unknown as AudioTelemetry;
    }
}
