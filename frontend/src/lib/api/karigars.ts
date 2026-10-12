import { masterCrudApi } from './masterCrud';
import { apiClient } from './client';

export const KARIGAR_JOB_TYPES = ['Cutting', 'Stitching', 'Dyeing', 'Embroidery', 'Finishing / Packing', 'Other'] as const;
export type KarigarJobType = (typeof KARIGAR_JOB_TYPES)[number];

export const GST_TYPES = ['Registered', 'Unregistered'] as const;
export type GstType = (typeof GST_TYPES)[number];

/** The backend's real JobWorker record (master/schemas/job-worker.schema.ts). */
export interface JobWorkerRecord {
  _id: string;
  name: string;
  type: 'FACTORY' | 'ARTISAN';
  contactPerson?: string;
  specialty?: string;
  mobile?: string;
  email?: string;
  address?: string;
  gstin?: string;
  notes?: string;
  isActive: boolean;
}

/** This app's view of a karigar — same record. Job type is the backend `specialty` field (older
 * records kept it as a `[jobType:..]` prefix in `notes`, still read here); GST status is derived
 * from whether a GSTIN is on file. */
export interface Karigar {
  id: string;
  fullName: string;
  firmName?: string;
  mobileNumber: string;
  jobType: KarigarJobType;
  gstType: GstType;
  gstNumber?: string;
  status: 'Active' | 'Inactive';
  rawNotes: string;
}

const NOTES_PREFIX = /^\[jobType:([^\]]*)\]\s*/;

function toKarigar(r: JobWorkerRecord): Karigar {
  const match = r.notes?.match(NOTES_PREFIX);
  const jobType = ((r.specialty || match?.[1]) as KarigarJobType) || 'Other';
  const rawNotes = r.notes?.replace(NOTES_PREFIX, '') ?? '';
  return {
    id: r._id,
    fullName: r.name,
    firmName: r.contactPerson,
    mobileNumber: r.mobile ?? '',
    jobType,
    gstType: r.gstin ? 'Registered' : 'Unregistered',
    gstNumber: r.gstin,
    status: r.isActive ? 'Active' : 'Inactive',
    rawNotes,
  };
}

function toPayload(input: { fullName: string; firmName?: string; mobileNumber: string; jobType: KarigarJobType; gstNumber?: string; notes?: string }) {
  return {
    name: input.fullName,
    type: 'ARTISAN' as const,
    contactPerson: input.firmName || undefined,
    mobile: input.mobileNumber || undefined,
    specialty: input.jobType,
    gstin: input.gstNumber || undefined,
    notes: input.notes || undefined,
  };
}

/** Request body for creating a karigar (also used when the create is saved offline). */
export const karigarPayload = toPayload;

const api = masterCrudApi<JobWorkerRecord>('/job-workers');

export const karigarsApi = {
  /** Karigars are the ARTISAN job workers; factories live under Masters > Factories. */
  list: async () => (await api.list({ type: 'ARTISAN' })).map(toKarigar),
  /** Everyone who can take a job slip (karigars and factories). */
  listAllParties: async () => (await api.list()).map(toKarigar),
  get: async (id: string) => toKarigar(await api.get(id)),
  create: (input: Parameters<typeof toPayload>[0]) => api.create(toPayload(input)),
  update: (id: string, input: Parameters<typeof toPayload>[0]) => {
    const { type: _type, ...rest } = toPayload(input);
    void _type;
    return api.update(id, rest);
  },
  setActive: (id: string, active: boolean) => apiClient.post(`/job-workers/${id}/${active ? 'reactivate' : 'deactivate'}`),
};
