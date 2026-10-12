import { apiClient } from './client';
import { idempotencyHeaders } from './procurement';
import type { ChargeBasis } from './production';

/** Fabric lot in the main warehouse that came in through purchase inward. */
export interface AvailableLot {
  lotId: string;
  lotNo: string;
  materialVariantId: string;
  materialId: string;
  materialName: string;
  colourName?: string;
  name: string;
  uom?: string;
  available: number;
  thans: number[];
  receivedOn?: string;
  supplierName?: string;
  origin: string;
  /** Parts processed fabric was made for, e.g. ["DUPATTA"]. */
  partLabels?: string[];
  costPerMeter?: number;
}

export type PartRoute = 'DIRECT' | 'PROCESS';

export interface MaterialJobSlipLineInput {
  part: string;
  lotId: string;
  qty: number;
  route?: PartRoute;
  processorJobWorkerId?: string;
  outputColourName?: string;
  processChargeBasis?: ChargeBasis;
  processRate?: number;
  avgPerPiece?: number;
  /** Inner colour of the main colour line with this lot id (same part). */
  innerOfLotId?: string;
}

export interface MaterialJobSlipInput {
  jobWorkerId: string;
  designId?: string;
  docDate?: string;
  challanNo?: string;
  lotNo?: string;
  expectedPieces?: number;
  chargeBasis: ChargeBasis;
  agreedRate: number;
  expectedCompletionDate?: string;
  instructions?: string;
  remarks?: string;
  lines: MaterialJobSlipLineInput[];
}

export type PartStage = 'WITH_KARIGAR' | 'DRAFT' | 'AT_PROCESSOR' | 'PROCESSED' | 'PARTLY_FORWARDED' | 'FORWARDED';

export interface MaterialJobSlipPart {
  part: string;
  material: string;
  lotNo?: string;
  qty: number;
  route: 'DIRECT' | 'PROCESS' | 'PROCESSED';
  stage: PartStage;
  issueNo?: string;
  date?: string;
  processingJobId?: string;
  processingJobNo?: string;
  processor?: string;
  forwardedQty?: number;
}

export interface MaterialJobSlipSummary {
  id: string;
  docNo: string;
  docDate: string;
  status: string;
  lotNo?: string;
  challanNo?: string;
  jobWorkerId: string;
  karigarName?: string;
  designId?: string;
  expectedPieces?: number;
  chargeBasis: ChargeBasis;
  agreedRate?: number;
  instructions?: string;
  remarks?: string;
  parts: MaterialJobSlipPart[];
  designNo?: string;
  designName?: string;
  makingPlan?: { part: string; lotNo?: string; colourName?: string; qty: number; avgPerPiece?: number; expectedPieces?: number; innerOfColour?: string; innerOfLotNo?: string }[];
  processingJobs: Array<{ id: string; jobNumber: string; status: string; factoryName: string; partLabel?: string; canReceive: boolean; expectedOutputQty: number; actualOutputQty: number | null; forwardedQty: number; outputMaterial: string; inputMaterial: string }>;
}

export const PART_STAGE_LABEL: Record<PartStage, string> = {
  WITH_KARIGAR: 'With karigar',
  DRAFT: 'Draft',
  AT_PROCESSOR: 'At dyer / processor',
  PROCESSED: 'Back from processing',
  PARTLY_FORWARDED: 'Partly sent to karigar',
  FORWARDED: 'Sent to karigar',
};

export const materialJobSlipsApi = {
  availableLots: (params: { materialId?: string; q?: string } = {}) =>
    apiClient.get<AvailableLot[]>('/job-slips/by-material/available-lots', { params }).then(r => r.data),
  create: (body: MaterialJobSlipInput) =>
    apiClient.post<MaterialJobSlipSummary>('/job-slips/by-material', body, idempotencyHeaders()).then(r => r.data),
  summary: (id: string) => apiClient.get<MaterialJobSlipSummary>(`/job-slips/by-material/${id}`).then(r => r.data),
  forwardProcessed: (processingJobId: string) =>
    apiClient.post(`/processing-jobs/${processingJobId}/forward`, undefined, idempotencyHeaders()).then(r => r.data),
};
