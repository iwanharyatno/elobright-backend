import { AudioTelemetry } from '../entities/AudioTelemetry';

export interface IAudioTelemetryRepository {
    create(data: Omit<AudioTelemetry, 'id'>): Promise<AudioTelemetry>;
}
