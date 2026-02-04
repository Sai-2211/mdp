import type { ChargerRepository, StartChargingResult } from '../../domain/repositories/chargerRepository';
import type { ApiClient } from '../api/apiClient';
import { getStatus as getStatusApi } from '../api/chargerApi';
import { startCharging as startChargingApi, stopCharging as stopChargingApi } from '../api/chargingApi';

export class ChargerRepositoryImpl implements ChargerRepository {
  constructor(private readonly api: ApiClient) {}

  getStatus() {
    return getStatusApi(this.api);
  }

  startCharging(): Promise<StartChargingResult> {
    return startChargingApi(this.api);
  }

  stopCharging(): Promise<void> {
    return stopChargingApi(this.api);
  }
}

