import { IAudioTelemetryRepository } from '../../domain/repositories/IAudioTelemetryRepository';
import { AudioTelemetry } from '../../domain/entities/AudioTelemetry';

export class StoreAudioTelemetry {
    constructor(private telemetryRepository: IAudioTelemetryRepository) {}

    async execute(data: Omit<AudioTelemetry, 'id'>): Promise<AudioTelemetry> {
        // Here you can add business validation or mapping if needed
        return this.telemetryRepository.create(data);
    }
}
