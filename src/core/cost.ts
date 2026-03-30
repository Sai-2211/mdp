export function estimateChargingCost(args: { energyWh: number; costPerWh: number }): number {
  return (Number(args.energyWh) || 0) * (Number(args.costPerWh) || 0);
}

export function formatMoney(args: { amount: number; currencySymbol: string }): string {
  const amount = Number(args.amount) || 0;
  const symbol = args.currencySymbol || '$';
  return `${symbol}${amount.toFixed(2)}`;
}
