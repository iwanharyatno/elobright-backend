export interface TelemetryMetrics {
    name: string;
    stalled: number;
    dns: number;
    initial_connection: number;
    ssl: number;
    waiting_time: number;
    download_time: number;
    total_time: number;
    timestamp: number;
    bytes: number;
}

export interface AudioTelemetry {
    id: string;
    userId: string;
    examSessionId: string;
    configuration: string;
    audioUrl: string;
    totalSize: number;
    timestamp: number;
    metrics: TelemetryMetrics;
}
