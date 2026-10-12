import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { RoleSchema } from '../identity/schemas/role.schema';
import { UserSchema } from '../identity/schemas/user.schema';
import { PermissionSchema } from '../identity/schemas/permission.schema';
import { AuditLogSchema } from '../audit/schemas/audit-log.schema';
import { StockLocationSchema } from '../master/schemas/stock-location.schema';
import { UomSchema } from '../master/schemas/uom.schema';
import { MaterialCategorySchema } from '../master/schemas/material-category.schema';
import { ProductCategorySchema } from '../master/schemas/product-category.schema';
import { SizeSchema } from '../master/schemas/size.schema';
import { CompanySettingsSchema } from '../master/schemas/company-settings.schema';
import { DEFAULT_ROLES } from '../identity/roles.seed-data';
import { ALL_STATIC_PERMISSION_KEYS } from '../identity/permissions.catalogue';

/**
 * Idempotent seed for a fresh environment (Phase 0/1 exit criteria): permissions, the nine
 * default roles (prd.md §2.2), a Super Admin, the fixed/virtual locations every posting
 * transaction from Phase 2 onward assumes exist, common UoMs, and starter masters. Safe to
 * re-run - every write is an upsert.
 */
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set.');
  await mongoose.connect(uri);
  // AuditLog must be registered before any plugin-audited model is written to.
  mongoose.model('AuditLog', AuditLogSchema);

  const RoleModel = mongoose.model('Role', RoleSchema);
  const UserModel = mongoose.model('User', UserSchema);
  const PermissionModel = mongoose.model('Permission', PermissionSchema);
  const StockLocationModel = mongoose.model('StockLocation', StockLocationSchema);
  const UomModel = mongoose.model('Uom', UomSchema);
  const MaterialCategoryModel = mongoose.model('MaterialCategory', MaterialCategorySchema);
  const ProductCategoryModel = mongoose.model('ProductCategory', ProductCategorySchema);
  const SizeModel = mongoose.model('Size', SizeSchema);
  const CompanySettingsModel = mongoose.model('CompanySettings', CompanySettingsSchema);

  console.log('Seeding permissions...');
  for (const key of ALL_STATIC_PERMISSION_KEYS) {
    await PermissionModel.updateOne(
      { key },
      { $setOnInsert: { key, module: key.split('.')[0] } },
      { upsert: true },
    );
  }

  console.log('Seeding roles (prd.md §2.2)...');
  for (const role of DEFAULT_ROLES) {
    await RoleModel.updateOne(
      { key: role.key },
      {
        $set: {
          name: role.name,
          permissions: role.permissions,
          isSystemRole: true,
          isActive: true,
        },
      },
      { upsert: true },
    );
  }

  console.log('Seeding Super Admin user...');
  const adminUsername = (process.env.SEED_ADMIN_USERNAME ?? 'admin').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const existingAdmin = await UserModel.findOne({ username: adminUsername });
  if (!existingAdmin) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    await UserModel.create({
      username: adminUsername,
      displayName: 'Super Admin',
      passwordHash,
      principal: 'internal',
      roleKeys: ['SUPER_ADMIN'],
      mustChangePassword: true,
    });
    console.log(
      `  Created Super Admin "${adminUsername}". CHANGE THIS PASSWORD IMMEDIATELY (set SEED_ADMIN_PASSWORD before seeding in any shared environment).`,
    );
  } else {
    console.log('  Super Admin already exists, skipping.');
  }

  console.log('Seeding fixed and virtual locations (MST-06, tech.md §4.3)...');
  const locations: Array<{ code: string; name: string; kind: string }> = [
    { code: 'MAIN-WH', name: 'Main Warehouse', kind: 'WAREHOUSE' },
    { code: 'QUARANTINE', name: 'Quarantine', kind: 'QUARANTINE' },
    { code: 'VIRT-SUPPLIER', name: 'Supplier (virtual)', kind: 'VIRTUAL_SUPPLIER' },
    { code: 'VIRT-CUSTOMER', name: 'Customer (virtual)', kind: 'VIRTUAL_CUSTOMER' },
    { code: 'VIRT-PRODUCTION', name: 'Production (virtual)', kind: 'VIRTUAL_PRODUCTION' },
    { code: 'VIRT-LOSS', name: 'Loss (virtual)', kind: 'VIRTUAL_LOSS' },
    { code: 'VIRT-ADJUSTMENT', name: 'Adjustment (virtual)', kind: 'VIRTUAL_ADJUSTMENT' },
  ];
  for (const loc of locations) {
    await StockLocationModel.updateOne({ code: loc.code }, { $setOnInsert: loc }, { upsert: true });
  }

  console.log('Seeding common UoMs...');
  const uoms = [
    { code: 'M', name: 'Metre' },
    { code: 'ROLL', name: 'Roll' },
    { code: 'KG', name: 'Kilogram' },
    { code: 'THAN', name: 'Than' },
    { code: 'PC', name: 'Piece' },
  ];
  for (const uom of uoms) {
    await UomModel.updateOne({ code: uom.code }, { $setOnInsert: uom }, { upsert: true });
  }

  console.log('Seeding starter material categories (MST-02)...');
  for (const name of ['Top Fabric', 'Bottom Fabric', 'Dupatta Fabric']) {
    await MaterialCategoryModel.updateOne({ name }, { $setOnInsert: { name } }, { upsert: true });
  }

  console.log('Seeding starter product category (MST-05)...');
  await ProductCategoryModel.updateOne(
    { name: 'Kurti Set' },
    { $setOnInsert: { name: 'Kurti Set' } },
    { upsert: true },
  );

  console.log('Seeding sizes XS-XXL (MST-05)...');
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  for (let i = 0; i < sizes.length; i++) {
    await SizeModel.updateOne(
      { name: sizes[i] },
      { $setOnInsert: { name: sizes[i], sortOrder: i } },
      { upsert: true },
    );
  }

  console.log('Seeding company settings (MST-10)...');
  await CompanySettingsModel.updateOne(
    { key: 'default' },
    {
      $setOnInsert: {
        legalName: process.env.COMPANY_LEGAL_NAME ?? 'Demo Garment Co',
        state: process.env.COMPANY_STATE ?? 'Maharashtra',
        gstin: process.env.COMPANY_GSTIN ?? '',
        currentFinancialYear: process.env.CURRENT_FINANCIAL_YEAR ?? '26-27',
      },
    },
    { upsert: true },
  );

  console.log('Seed complete.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
