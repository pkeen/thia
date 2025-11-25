import { Clock } from "application/ports/clock.port";

// infra/clock/system-clock.ts
export class SystemClock implements Clock {
    now() {
        return new Date();
    }
}