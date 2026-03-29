export function estimateChargingCost(args: { energyWh: number; costPerKwh: number }): number {
  const ratePerWh = (Number(args.costPerKwh) || 0) / 1000;
  return args.energyWh * ratePerWh;
}

export function formatMoney(args: { amount: number; currencySymbol: string }): string {
  const amount = Number(args.amount) || 0;
  const symbol = args.currencySymbol || '$';
  return `${symbol}${amount.toFixed(2)}`;
}

