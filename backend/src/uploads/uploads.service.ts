import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { AppConfig } from '../config/configuration';
import { ProblemException } from '../common/errors/problem.exception';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadedFileResult {
  url: string;
  publicId: string;
}

/**
 * NFR-04 "safe file upload" (type, size, storage outside the web root): the file never
 * touches this server's disk - it is validated in memory (multer memoryStorage) and streamed
 * straight to Cloudinary, so there is no local upload directory to secure or clean up.
 */
@Injectable()
export class UploadsService implements OnModuleInit {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    const { cloudName, apiKey, apiSecret } = this.config.get('cloudinary', { infer: true });
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    }
  }

  private assertConfigured(): void {
    const { cloudName, apiKey, apiSecret } = this.config.get('cloudinary', { infer: true });
    if (!cloudName || !apiKey || !apiSecret) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        500,
        'File uploads are not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET missing).',
      );
    }
  }

  validateFile(file: Express.Multer.File | undefined): Express.Multer.File {
    if (!file) throw new ProblemException('VALIDATION_FAILED', 422, 'No file was uploaded.');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Unsupported file type "${file.mimetype}". Allowed: JPEG, PNG, WEBP, PDF.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'File exceeds the 10 MB limit.');
    }
    return file;
  }

  async upload(file: Express.Multer.File, folder: string): Promise<UploadedFileResult> {
    this.assertConfigured();
    this.validateFile(file);

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `garment-erp/${folder}`, resource_type: 'auto' },
        (err, result) => {
          if (err || !result) {
            reject(new ProblemException('VALIDATION_FAILED', 502, `Upload failed: ${err?.message ?? 'unknown error'}`));
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      stream.end(file.buffer);
    });
  }
}
