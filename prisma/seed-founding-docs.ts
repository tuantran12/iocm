import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const foundingDocuments = [
  {
    code: 'FND-01',
    name: 'Đơn đăng ký hoạt động KH&CN (Mẫu 5)',
    type: 'registration_form',
    priority: 'CRITICAL',
    riskIfMissing: 'Không thể nộp hồ sơ đăng ký nếu thiếu đơn chính thức',
  },
  {
    code: 'FND-02',
    name: 'Quyết định thành lập tổ chức KH&CN',
    type: 'founding_decision',
    priority: 'CRITICAL',
    riskIfMissing: 'Không có cơ sở pháp lý cho sự tồn tại của tổ chức',
  },
  {
    code: 'FND-03',
    name: 'Điều lệ tổ chức và hoạt động',
    type: 'charter',
    priority: 'CRITICAL',
    riskIfMissing: 'Không có quy định nội bộ về cách vận hành tổ chức',
  },
  {
    code: 'FND-04',
    name: 'Lý lịch khoa học người đứng đầu (Mẫu 11)',
    type: 'head_person_cv',
    priority: 'CRITICAL',
    riskIfMissing: 'Không chứng minh được người đứng đầu đủ điều kiện',
  },
  {
    code: 'FND-05',
    name: 'Bản sao bằng cấp người đứng đầu',
    type: 'head_person_diploma',
    priority: 'CRITICAL',
    riskIfMissing: 'Thiếu bằng chứng trình độ người đứng đầu',
  },
  {
    code: 'FND-06',
    name: 'Danh sách nhân lực KH&CN (Mẫu 8)',
    type: 'personnel_list',
    priority: 'CRITICAL',
    riskIfMissing: 'Không chứng minh đủ điều kiện nhân lực (≥5 ĐH, ≥40% chính thức)',
  },
  {
    code: 'FND-07',
    name: 'Lý lịch khoa học nhân sự chính thức (Mẫu 9)',
    type: 'personnel_cv_fulltime',
    priority: 'HIGH',
    riskIfMissing: 'Thiếu chi tiết nhân sự chính thức — cần cho từng người',
  },
  {
    code: 'FND-08',
    name: 'Lý lịch khoa học nhân sự kiêm nhiệm (Mẫu 10)',
    type: 'personnel_cv_parttime',
    priority: 'HIGH',
    riskIfMissing: 'Thiếu chi tiết nhân sự kiêm nhiệm — cần nếu có nhân sự bán thời gian',
  },
  {
    code: 'FND-09',
    name: 'Bản sao bằng cấp nhân sự (tất cả)',
    type: 'personnel_diplomas',
    priority: 'HIGH',
    riskIfMissing: 'Không chứng minh trình độ nhân sự kê khai',
  },
  {
    code: 'FND-10',
    name: 'Bảng kê khai cơ sở vật chất - kỹ thuật (Mẫu 12)',
    type: 'facility_declaration',
    priority: 'CRITICAL',
    riskIfMissing: 'Không chứng minh có đủ CSVC phục vụ hoạt động KH&CN',
  },
  {
    code: 'FND-11',
    name: 'Hồ sơ trụ sở (HĐ thuê/sở hữu/mượn)',
    type: 'premises_proof',
    priority: 'CRITICAL',
    riskIfMissing: 'Không chứng minh có trụ sở hợp lệ',
  },
  {
    code: 'FND-12',
    name: 'Biên bản họp sáng lập viên',
    type: 'founders_meeting',
    priority: 'HIGH',
    riskIfMissing: 'Thiếu bằng chứng đồng thuận sáng lập (cần nếu có nhiều sáng lập viên)',
  },
  {
    code: 'FND-13',
    name: 'Danh sách sáng lập viên + CMND/CCCD',
    type: 'founders_list',
    priority: 'HIGH',
    riskIfMissing: 'Thiếu thông tin định danh sáng lập viên',
  },
  {
    code: 'FND-14',
    name: 'Đề án thành lập (nội bộ)',
    type: 'establishment_proposal',
    priority: 'MEDIUM',
    riskIfMissing: 'Khuyến nghị nội bộ — giúp giải trình mục tiêu, chiến lược',
  },
  {
    code: 'FND-15',
    name: 'Phương án tài chính / Cam kết vốn',
    type: 'financial_plan',
    priority: 'MEDIUM',
    riskIfMissing: 'Có thể bị yêu cầu bổ sung nếu cơ quan đăng ký cần',
  },
  {
    code: 'FND-16',
    name: 'Cam kết của nhân sự chính thức',
    type: 'personnel_commitment',
    priority: 'HIGH',
    riskIfMissing: 'Cần cam kết bằng văn bản rằng nhân sự sẽ làm việc tại tổ chức',
  },
  {
    code: 'FND-17',
    name: 'Văn bản đồng ý cho kiêm nhiệm (nếu có công chức/viên chức)',
    type: 'secondment_approval',
    priority: 'MEDIUM',
    riskIfMissing: 'Bắt buộc nếu nhân sự kiêm nhiệm là công chức/viên chức nhà nước',
  },
];

async function main() {
  console.log('🏛️  Seeding founding documents...');

  // --- 1. Upsert all 17 founding documents ---
  for (const doc of foundingDocuments) {
    await prisma.documentItem.upsert({
      where: { code: doc.code },
      update: {
        name: doc.name,
        type: doc.type,
        cluster: 'CORE_FOUNDING',
        priority: doc.priority as any,
        riskIfMissing: doc.riskIfMissing,
      },
      create: {
        code: doc.code,
        name: doc.name,
        type: doc.type,
        cluster: 'CORE_FOUNDING',
        status: 'NOT_STARTED',
        priority: doc.priority as any,
        riskIfMissing: doc.riskIfMissing,
      },
    });
  }
  console.log(`  ✔ ${foundingDocuments.length} founding documents seeded`);

  // --- 2. Create Registration Dossier and link documents ---
  const profile = await prisma.instituteProfile.findFirst();
  if (!profile) {
    console.log('  ⚠ No InstituteProfile found — creating default profile...');
    const newProfile = await prisma.instituteProfile.create({
      data: {
        nameVi: 'Viện Nghiên cứu Ứng dụng Công nghệ và Luật',
        nameEn: 'Institute of Applied Technology and Law',
        abbreviation: 'IATL',
        instituteType: 'science_technology',
        founderType: 'individual',
        registrationAuthority: 'Sở Khoa học và Công nghệ',
        status: 'planning',
      },
    });
    await createDossier(newProfile.id);
  } else {
    await createDossier(profile.id);
  }

  console.log('✅ Founding documents seed complete!');
}

async function createDossier(instituteId: string) {
  const existingDossier = await prisma.registrationDossier.findFirst({
    where: { code: 'HS-2025-001' },
  });

  if (existingDossier) {
    console.log('  ℹ Dossier HS-2025-001 already exists — skipping creation');
    return;
  }

  const dossier = await prisma.registrationDossier.create({
    data: {
      instituteId,
      code: 'HS-2025-001',
      registrationAuthority: 'Sở Khoa học và Công nghệ',
      submissionMethod: 'direct',
      status: 'preparing',
    },
  });
  console.log(`  ✔ Dossier created: ${dossier.code}`);

  // Link all CRITICAL documents as mandatory
  const criticalDocs = await prisma.documentItem.findMany({
    where: { cluster: 'CORE_FOUNDING', priority: 'CRITICAL' },
  });

  for (const doc of criticalDocs) {
    await prisma.registrationDossierItem.create({
      data: {
        dossierId: dossier.id,
        documentId: doc.id,
        requirementLevel: 'mandatory_for_submission',
        itemStatus: 'missing',
      },
    });
  }

  // Link all HIGH priority documents as mandatory
  const highDocs = await prisma.documentItem.findMany({
    where: { cluster: 'CORE_FOUNDING', priority: 'HIGH' },
  });

  for (const doc of highDocs) {
    await prisma.registrationDossierItem.create({
      data: {
        dossierId: dossier.id,
        documentId: doc.id,
        requirementLevel: 'mandatory_for_submission',
        itemStatus: 'missing',
      },
    });
  }

  // Link MEDIUM priority documents as conditional
  const mediumDocs = await prisma.documentItem.findMany({
    where: { cluster: 'CORE_FOUNDING', priority: 'MEDIUM' },
  });

  for (const doc of mediumDocs) {
    await prisma.registrationDossierItem.create({
      data: {
        dossierId: dossier.id,
        documentId: doc.id,
        requirementLevel: 'conditional',
        itemStatus: 'missing',
      },
    });
  }

  const totalItems = criticalDocs.length + highDocs.length + mediumDocs.length;
  console.log(`  ✔ Dossier linked with ${totalItems} items (${criticalDocs.length} critical, ${highDocs.length} high, ${mediumDocs.length} medium)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
