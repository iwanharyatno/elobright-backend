import { Router } from 'express';
import { AudioTelemetryController } from '../../../interface-adapters/controllers/AudioTelemetryController';
import { StoreAudioTelemetry } from '../../../use-cases/audio-telemetry/StoreAudioTelemetry';
import { DrizzleAudioTelemetryRepository } from '../../../interface-adapters/repositories/DrizzleAudioTelemetryRepository';

const router = Router();

const telemetryRepository = new DrizzleAudioTelemetryRepository();
const storeAudioTelemetry = new StoreAudioTelemetry(telemetryRepository);
const audioTelemetryController = new AudioTelemetryController(storeAudioTelemetry);

router.post('/', audioTelemetryController.store);

export { router as audioTelemetryRoutes };
