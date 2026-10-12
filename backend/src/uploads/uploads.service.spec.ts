import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service';
import { AppConfig } from '../config/configuration';
import { ProblemException } from '../common/errors/problem.exception';

function makeService(cloudinaryConfig = { cloudName: '', apiKey: '', apiSecret: '' }): UploadsService {
  const config = {
    get: () => cloudinaryConfig,
  } as unknown as ConfigService<AppConfig, true>;
  return new UploadsService(config);
}

describe('UploadsService.validateFile (NFR-04: safe file upload)', () => {
  const service = makeService();

  it('rejects a missing file', () => {
    expect(() => service.validateFile(undefined)).toThrow(ProblemException);
  });

  it('rejects an unsupported mime type', () => {
    const file = { mimetype: 'application/x-msdownload', size: 100 } as Express.Multer.File;
    expect(() => service.validateFile(file)).toThrow(ProblemException);
  });

  it('rejects a file over the 10 MB limit', () => {
    const file = { mimetype: 'image/png', size: 11 * 1024 * 1024 } as Express.Multer.File;
    expect(() => service.validateFile(file)).toThrow(ProblemException);
  });

  it('accepts a well-formed image file', () => {
    const file = { mimetype: 'image/png', size: 1024 } as Express.Multer.File;
    expect(service.validateFile(file)).toBe(file);
  });

  it('accepts a well-formed PDF (purchase attachment)', () => {
    const file = { mimetype: 'application/pdf', size: 2048 } as Express.Multer.File;
    expect(service.validateFile(file)).toBe(file);
  });
});

describe('UploadsService.upload without Cloudinary configured', () => {
  it('fails clearly instead of silently doing nothing', async () => {
    const service = makeService();
    const file = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;
    await expect(service.upload(file, 'design-images')).rejects.toThrow(ProblemException);
  });
});
