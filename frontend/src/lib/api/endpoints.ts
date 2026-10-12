// Central registry of all API endpoint paths.
// These must match the backend routes exactly.

export const API = {
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    me: '/auth/me',
  },
  suppliers: {
    list: '/suppliers',
    create: '/suppliers',
    get: (id: string) => `/suppliers/${id}`,
    update: (id: string) => `/suppliers/${id}`,
    deactivate: (id: string) => `/suppliers/${id}/deactivate`,
  },
  materials: {
    list: '/materials',
    create: '/materials',
    get: (id: string) => `/materials/${id}`,
    update: (id: string) => `/materials/${id}`,
  },
  colours: {
    list: '/colours',
    create: '/colours',
    get: (id: string) => `/colours/${id}`,
    update: (id: string) => `/colours/${id}`,
  },
  units: {
    list: '/units',
    create: '/units',
    get: (id: string) => `/units/${id}`,
    update: (id: string) => `/units/${id}`,
  },
  sizes: {
    list: '/sizes',
    create: '/sizes',
    get: (id: string) => `/sizes/${id}`,
    update: (id: string) => `/sizes/${id}`,
  },
  locations: {
    list: '/locations',
    create: '/locations',
    get: (id: string) => `/locations/${id}`,
    update: (id: string) => `/locations/${id}`,
  },
  customers: {
    list: '/customers',
    create: '/customers',
    get: (id: string) => `/customers/${id}`,
    update: (id: string) => `/customers/${id}`,
  },
  categories: {
    list: '/categories',
    create: '/categories',
    get: (id: string) => `/categories/${id}`,
    update: (id: string) => `/categories/${id}`,
  },
  factories: {
    list: '/factories',
    create: '/factories',
    get: (id: string) => `/factories/${id}`,
    update: (id: string) => `/factories/${id}`,
  },
  processes: {
    list: '/processes',
    create: '/processes',
    get: (id: string) => `/processes/${id}`,
    update: (id: string) => `/processes/${id}`,
  },
  purchases: {
    list: '/purchases',
    create: '/purchases',
    get: (id: string) => `/purchases/${id}`,
    update: (id: string) => `/purchases/${id}`,
    confirm: (id: string) => `/purchases/${id}/confirm`,
    cancel: (id: string) => `/purchases/${id}/cancel`,
  },
  inward: {
    list: '/inward',
    create: '/inward',
    get: (id: string) => `/inward/${id}`,
    confirm: (id: string) => `/inward/${id}/confirm`,
    pending: '/inward/pending',
  },
  designs: {
    list: '/designs',
    create: '/designs',
    get: (id: string) => `/designs/${id}`,
    update: (id: string) => `/designs/${id}`,
  },
  jobSlips: {
    list: '/job-slips',
    create: '/job-slips',
    get: (id: string) => `/job-slips/${id}`,
    update: (id: string) => `/job-slips/${id}`,
    issue: (id: string) => `/job-slips/${id}/issue-material`,
    cancel: (id: string) => `/job-slips/${id}/cancel`,
  },
  issuance: {
    list: '/material-issues',
    create: '/material-issues',
    get: (id: string) => `/material-issues/${id}`,
    confirm: (id: string) => `/material-issues/${id}/confirm`,
    pending: '/material-issues/pending',
  },
  stock: {
    raw: '/stock/raw',
    ready: '/stock/ready',
    ledger: '/stock/ledger',
    lots: '/stock/lots',
  },
};
