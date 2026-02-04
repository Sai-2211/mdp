import type { ChargerRepository } from '../repositories/chargerRepository';

export async function fetchChargerStatus(repo: ChargerRepository) {
  return repo.getStatus();
}

export async function startCharging(repo: ChargerRepository) {
  return repo.startCharging();
}

export async function stopCharging(repo: ChargerRepository) {
  return repo.stopCharging();
}

