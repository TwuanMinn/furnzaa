/** Client contract for /api/schedule (mirrors the route's response shape). */

export type ScheduleState = "queued" | "printing" | "completed" | "failed";

export interface ScheduleCard {
  orderId: string;
  orderCode: string;
  customerName: string | null;
  productName: string | null;
  productImage: string | null;
  priority: string;
  material: string | null;
  printerId: string | null;
  printerLabel: string | null;
  printerColor: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  state: ScheduleState;
  queuePosition: number;
  scheduledAt: string;
  printStartedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  completedAt: string | null;
}

export interface PrinterCapacity {
  printerId: string;
  label: string;
  color: string;
  queuedJobs: number;
  queuedMinutes: number;
  printingRemainingMinutes: number;
  busy: boolean;
  freeBy: string;
}

export interface TrayCard {
  orderId: string;
  orderCode: string;
  priority: string;
  estimatedMinutes: number | null;
  material: string | null;
  customerName: string | null;
}

export interface BoardData {
  columns: Record<ScheduleState, ScheduleCard[]>;
  hasMore: { queued: boolean; completed: boolean; failed: boolean };
  capacity: PrinterCapacity[];
  tray: TrayCard[];
  serverNow: string;
}
