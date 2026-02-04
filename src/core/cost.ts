export function energyWhToKwh(energyWh: number): number {
  return (Number(energyWh) || 0) / 1000;
}

export function estimateChargingCost(args: { energyWh: number; costPerKwh: number }): number {
  const kwh = energyWhToKwh(args.energyWh);
  const rate = Number(args.costPerKwh) || 0;
  return kwh * rate;
}

export function formatMoney(args: { amount: number; currencySymbol: string }): string {
  const amount = Number(args.amount) || 0;
  const symbol = args.currencySymbol || '$';
  return `${symbol}${amount.toFixed(2)}`;
}

