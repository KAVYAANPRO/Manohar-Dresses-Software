import { apiClient } from './client';
import { idempotencyHeaders } from './procurement';

export type ProcessRateBasis = 'PER_METER' | 'LUMP_SUM';

export interface ProcessingBatchInput {
  processorJobWorkerId: string;
  processingTypeId?: string;
  processName: string;
  parts: string[];
  rate: number;
  rateBasis?: ProcessRateBasis;
  expenses?: number;
  docDate?: string;
  challanNo?: string;
  lotNo?: string;
  expectedReturnDate?: string;
  remarks?: string;
  lines: { lotId: string; colourName: string; thans: number[] }[];
}

export interface ProcessingBatchThan { id: string; no: number; sent: number; received: number | null }

export interface ProcessingBatchLine {
  id: string;
  lotId: string;
  lotNo?: string;
  colourName: string;
  inputCostPerMeter?: number;
  costPerMeterBeforeProcessing?: number;
  sent: number;
  sentReceived: number;
  received: number;
  shrinkage: number;
  shrinkagePct: number;
  thans: ProcessingBatchThan[];
}

export interface ProcessingBatchSummary {
  id: string;
  docNo: string;
  docDate: string;
  status: string;
  lotNo?: string;
  challanNo?: string;
  processorId: string;
  processorName?: string;
  processName: string;
  parts: string[];
  colours: string[];
  rate?: number;
  rateBasis: ProcessRateBasis;
  expenses?: number;
  expensesPerMeter?: number;
  thansSent: number;
  thansReceived: number;
  sent: number;
  received: number;
  shrinkage: number;
  expectedReturnDate?: string;
  remarks?: string;
}

export interface ProcessingBatchDetail extends ProcessingBatchSummary {
  lines: ProcessingBatchLine[];
  outputLots: { lotId: string; lotNo: string; unitCost?: number; partLabels: string[]; thans: number[] }[];
  receipts: { id: string; docNo: string; docDate: string; summary?: { sentQty: number; receivedQty: number; shortageQty: number; shortagePct: number } }[];
}

export const processingBatchesApi = {
  list: () => apiClient.get<ProcessingBatchSummary[]>('/processing-batches').then(r => r.data),
  get: (id: string) => apiClient.get<ProcessingBatchDetail>(`/processing-batches/${id}`).then(r => r.data),
  create: (body: ProcessingBatchInput) => apiClient.post<ProcessingBatchDetail>('/processing-batches', body, idempotencyHeaders()).then(r => r.data),
  receive: (id: string, body: { docDate?: string; remarks?: string; lines: { lineId: string; thans: { thanId: string; received: number }[] }[] }) =>
    apiClient.post<ProcessingBatchDetail>(`/processing-batches/${id}/receive`, body, idempotencyHeaders()).then(r => r.data),
};

export const PART_OPTIONS = ['TOP', 'BOTTOM', 'DUPATTA'] as const;
export const PROCESS_OPTIONS = ['DYEING', 'PRINTING', 'EMBROIDERY', 'WASHING', 'OTHER'] as const;
