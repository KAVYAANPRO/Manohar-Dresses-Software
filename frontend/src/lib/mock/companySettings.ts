export interface CompanyProfile {
  legalName: string;
  gstin: string;
  state: string;
  address: string;
  email: string;
  phone: string;
  financialYearStart: string;
  /** Where automated payment-reminder and other business alerts are sent (WhatsApp click-to-chat). */
  ownerWhatsapp: string;
}

// TODO: Replace with API call — GET /api/v1/settings/company
export const mockCompany: CompanyProfile = {
  legalName: 'Ananya Garments Pvt. Ltd.',
  gstin: '27AABCA1234B1ZY',
  state: 'Maharashtra',
  address: '12, Textile Market, Surat Road, Mumbai – 400001',
  email: 'accounts@ananyagarments.in',
  phone: '+91 98765 43210',
  financialYearStart: '04-01',
  ownerWhatsapp: '+91 98765 43210',
};
