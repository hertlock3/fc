import { Badge } from "@/components/ui";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONE } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status] ?? "neutral"}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
