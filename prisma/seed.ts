import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- 1. Seed 19 Roles ---
  const roles = [
    {
      name: 'System_Admin',
      description: 'Quản trị hệ thống toàn quyền',
      permissions: { all: true },
    },
    {
      name: 'Director',
      description: 'Viện trưởng / Giám đốc điều hành',
      permissions: { approve: true, manage_members: true, manage_finance: true, manage_projects: true, view_all: true },
    },
    {
      name: 'Core_Team_Member',
      description: 'Thành viên đội core sáng lập và vận hành',
      permissions: { manage_documents: true, manage_workspace: true, view_internal: true },
    },
    {
      name: 'Legal_Officer',
      description: 'Cán bộ pháp lý — quản lý căn cứ pháp lý, hợp đồng, tuân thủ',
      permissions: { manage_legal_basis: true, review_agreements: true, manage_compliance: true },
    },
    {
      name: 'Finance_Officer',
      description: 'Cán bộ tài chính — quản lý phí, hóa đơn, ngân sách',
      permissions: { manage_fees: true, manage_invoices: true, view_finance: true },
    },
    {
      name: 'Membership_Manager',
      description: 'Quản lý hội viên — hồ sơ, đơn gia nhập, cấp hội viên',
      permissions: { manage_members: true, manage_applications: true, manage_tiers: true },
    },
    {
      name: 'Partnership_Manager',
      description: 'Quản lý đối tác — hồ sơ đối tác, hợp tác, thẩm định',
      permissions: { manage_partners: true, manage_due_diligence: true, manage_agreements: true },
    },
    {
      name: 'DPO',
      description: 'Data Protection Officer — bảo vệ dữ liệu cá nhân, consent, DSAR',
      permissions: { manage_data_catalog: true, manage_consent: true, manage_dsar: true, review_data_protection: true },
    },
    {
      name: 'Tech_Director',
      description: 'Giám đốc công nghệ — sản phẩm, kiến trúc, review kỹ thuật',
      permissions: { manage_products: true, review_technical: true, manage_pilots: true },
    },
    {
      name: 'Project_Manager',
      description: 'Quản lý dự án — triển khai, KPI, pilot, nhóm dự án',
      permissions: { manage_projects: true, manage_kpis: true, manage_tasks: true, manage_groups: true },
    },
    {
      name: 'Community_Officer',
      description: 'Cán bộ cộng đồng — sự kiện, nhóm hội viên, truyền thông',
      permissions: { manage_events: true, manage_groups: true, manage_notifications: true },
    },
    {
      name: 'Council_Chair',
      description: 'Chủ tịch Hội đồng — phê duyệt cấp cao, quyết định chiến lược',
      permissions: { approve_high_risk: true, manage_council: true, view_all: true },
    },
    {
      name: 'Council_Member',
      description: 'Thành viên Hội đồng — tham gia biểu quyết, review',
      permissions: { vote: true, view_council: true, review_proposals: true },
    },
    {
      name: 'Enterprise_Admin',
      description: 'Quản trị viên doanh nghiệp hội viên — quản lý tài khoản DN',
      permissions: { manage_enterprise_users: true, view_enterprise_data: true, manage_enterprise_profile: true },
    },
    {
      name: 'Enterprise_Member',
      description: 'Nhân viên doanh nghiệp hội viên — truy cập theo quyền DN',
      permissions: { view_enterprise_data: true, participate_groups: true, view_benefits: true },
    },
    {
      name: 'Group_Moderator',
      description: 'Điều phối viên nhóm — quản lý thành viên, nội dung nhóm',
      permissions: { manage_group_members: true, manage_group_content: true, pin_messages: true },
    },
    {
      name: 'External_Expert',
      description: 'Chuyên gia bên ngoài — tham gia review, tư vấn theo lời mời',
      permissions: { view_assigned: true, comment: true, review_assigned: true },
    },
    {
      name: 'Auditor',
      description: 'Kiểm toán viên — xem audit log, báo cáo tuân thủ, không sửa dữ liệu',
      permissions: { view_audit_logs: true, view_compliance: true, export_reports: true },
    },
    {
      name: 'Viewer',
      description: 'Người xem — chỉ đọc tài liệu công khai và thông tin được cấp quyền',
      permissions: { view_public: true },
    },
  ];

  console.log('  → Seeding 19 roles...');
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, permissions: role.permissions },
      create: role,
    });
  }
  console.log('  ✔ 19 roles seeded');


  // --- 2. Seed 7 Membership Tiers ---
  const tiers = [
    {
      name: 'Associate Member',
      description: 'Hội viên liên kết — tham gia sự kiện, nhận thông tin, không biểu quyết',
      annualFee: 5_000_000,
      benefits: { event_access: true, newsletter: true, networking: true, working_group_public: true },
      accessRights: { documents: 'public', groups: 'public_only' },
      votingRight: false,
      projectRight: false,
      maxUsers: 2,
    },
    {
      name: 'Standard Member',
      description: 'Hội viên tiêu chuẩn — tham gia nhóm, đề xuất hợp tác, biểu quyết',
      annualFee: 20_000_000,
      benefits: { event_access: true, working_group_access: true, project_proposal: true, training_access: true, networking: true, report_access: 'summary' },
      accessRights: { documents: 'internal', groups: 'approval_required' },
      votingRight: true,
      projectRight: true,
      maxUsers: 5,
    },
    {
      name: 'Strategic Member',
      description: 'Hội viên chiến lược — ưu tiên dự án, tham gia hội đồng tư vấn',
      annualFee: 50_000_000,
      benefits: { event_access: true, working_group_access: true, project_proposal: true, priority_project: true, council_observer: true, branding_visibility: true, consultation_session: 4, report_access: 'full' },
      accessRights: { documents: 'internal', groups: 'invite_priority' },
      votingRight: true,
      projectRight: true,
      maxUsers: 10,
    },
    {
      name: 'Technology Partner Member',
      description: 'Hội viên đối tác công nghệ — triển khai sản phẩm, pilot, showcase',
      annualFee: 30_000_000,
      benefits: { event_access: true, technology_showcase: true, pilot_participation: true, working_group_access: true, branding_visibility: true, training_access: true, report_access: 'technical' },
      accessRights: { documents: 'internal', groups: 'tech_domain' },
      votingRight: false,
      projectRight: true,
      maxUsers: 5,
    },
    {
      name: 'Founding Enterprise Member',
      description: 'Hội viên sáng lập — quyền lợi cao nhất, tham gia hội đồng, miễn phí năm đầu',
      annualFee: 100_000_000,
      benefits: { event_access: true, working_group_access: true, project_proposal: true, priority_project: true, council_member: true, branding_visibility: true, consultation_session: 12, technology_showcase: true, pilot_participation: true, report_access: 'full', first_year_waiver: true },
      accessRights: { documents: 'restricted', groups: 'all' },
      votingRight: true,
      projectRight: true,
      maxUsers: 20,
    },
    {
      name: 'Sponsor Member',
      description: 'Hội viên tài trợ — đóng góp tài chính, branding nổi bật, ưu tiên sự kiện',
      annualFee: 200_000_000,
      benefits: { event_access: true, premium_branding: true, keynote_opportunity: true, working_group_access: true, priority_project: true, consultation_session: 8, report_access: 'full', exclusive_networking: true },
      accessRights: { documents: 'internal', groups: 'sponsor_priority' },
      votingRight: true,
      projectRight: true,
      maxUsers: 15,
    },
    {
      name: 'Research Partner Member',
      description: 'Hội viên đối tác nghiên cứu — hợp tác R&D, chia sẻ dữ liệu, đồng xuất bản',
      annualFee: 15_000_000,
      benefits: { research_collaboration: true, data_sharing: true, co_publication: true, working_group_access: true, event_access: true, report_access: 'research' },
      accessRights: { documents: 'research', groups: 'research_domain' },
      votingRight: false,
      projectRight: true,
      maxUsers: 5,
    },
  ];

  console.log('  → Seeding 7 membership tiers...');
  for (const tier of tiers) {
    await prisma.membershipTier.upsert({
      where: { name: tier.name },
      update: {
        description: tier.description,
        annualFee: tier.annualFee,
        benefits: tier.benefits,
        accessRights: tier.accessRights,
        votingRight: tier.votingRight,
        projectRight: tier.projectRight,
        maxUsers: tier.maxUsers,
      },
      create: tier,
    });
  }
  console.log('  ✔ 7 membership tiers seeded');


  // --- 3. Seed Legal Bases (Vietnamese laws) ---
  // NOTE: All legal basis entries need manual verification against official sources
  // (vbpl.vn, thuvienphapluat.vn, or official gazette). Dates and numbers below
  // are best-effort and should be cross-checked before production use.
  const legalBases = [
    // === LUẬT (Laws) ===
    {
      documentNumber: '93/2025/QH15',
      title: 'Luật Khoa học và Công nghệ (sửa đổi)',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2025-10-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Luật quy định về tổ chức, hoạt động khoa học và công nghệ; quyền và nghĩa vụ của tổ chức, cá nhân hoạt động KH&CN. Căn cứ chính để thành lập Viện.',
    },
    {
      documentNumber: '59/2020/QH14',
      title: 'Luật Doanh nghiệp 2020',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2021-01-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về thành lập, tổ chức quản lý, tổ chức lại, giải thể và hoạt động có liên quan của doanh nghiệp. Áp dụng cho doanh nghiệp hội viên.',
    },
    {
      documentNumber: '86/2015/QH13',
      title: 'Luật An toàn thông tin mạng',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2016-07-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về hoạt động an toàn thông tin mạng, quyền và nghĩa vụ của cơ quan, tổ chức, cá nhân trong bảo đảm an toàn thông tin mạng. Áp dụng cho hệ thống CNTT của Viện.',
    },
    {
      documentNumber: '24/2018/QH14',
      title: 'Luật An ninh mạng',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2019-01-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về bảo vệ an ninh quốc gia và bảo đảm trật tự, an toàn xã hội trên không gian mạng. Áp dụng cho hệ thống thông tin và dữ liệu của Viện.',
    },
    {
      documentNumber: '07/2006/QH11',
      title: 'Luật Công nghệ thông tin',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2007-01-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về hoạt động ứng dụng và phát triển công nghệ thông tin, biện pháp bảo đảm ứng dụng và phát triển CNTT. Nền tảng pháp lý cho hoạt động CNTT của Viện.',
    },
    {
      documentNumber: '50/2005/QH11',
      title: 'Luật Sở hữu trí tuệ',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2006-07-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về quyền tác giả, quyền sở hữu công nghiệp, quyền đối với giống cây trồng. Áp dụng cho sản phẩm nghiên cứu và công nghệ của Viện.',
    },
    {
      documentNumber: '07/2022/QH15',
      title: 'Luật sửa đổi, bổ sung một số điều của Luật Sở hữu trí tuệ',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2023-01-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Sửa đổi Luật SHTT về đăng ký sáng chế, nhãn hiệu, quyền tác giả trong môi trường số. Áp dụng cho bảo hộ kết quả nghiên cứu của Viện và đối tác.',
    },
    {
      documentNumber: '20/2023/QH15',
      title: 'Luật Giao dịch điện tử 2023 (thay thế Luật 51/2005)',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2024-07-01'),
      basisType: 'law',
      scope: 'conditional',
      summary: 'Quy định về giao dịch điện tử, chữ ký số, hợp đồng điện tử — áp dụng cho hệ thống ký kết trực tuyến của Viện.',
    },
    {
      documentNumber: '45/2019/QH14',
      title: 'Bộ luật Lao động 2019',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2021-01-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định tiêu chuẩn lao động, quyền và nghĩa vụ của người lao động và người sử dụng lao động. Áp dụng cho nhân sự Viện.',
    },
    {
      documentNumber: '38/2024/QH15',
      title: 'Luật Dữ liệu',
      issuingAuth: 'Quốc hội',
      effectiveDate: new Date('2025-07-01'),
      basisType: 'law',
      scope: 'mandatory',
      summary: 'Quy định về quản lý, kết nối, chia sẻ, quản trị dữ liệu; xây dựng, phát triển, vận hành cơ sở dữ liệu. Áp dụng cho data catalog và quản trị dữ liệu của Viện.',
    },

    // === NGHỊ ĐỊNH (Decrees) ===
    {
      documentNumber: '08/2014/NĐ-CP',
      title: 'Nghị định quy định chi tiết và hướng dẫn thi hành một số điều của Luật Khoa học và Công nghệ',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2014-02-18'),
      basisType: 'decree',
      scope: 'mandatory',
      summary: 'Hướng dẫn chi tiết về thành lập, đăng ký hoạt động tổ chức KH&CN; điều kiện, thủ tục, quyền và nghĩa vụ.',
    },
    {
      documentNumber: '13/2023/NĐ-CP',
      title: 'Nghị định Bảo vệ dữ liệu cá nhân',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2023-07-01'),
      basisType: 'decree',
      scope: 'mandatory',
      summary: 'Quy định về bảo vệ dữ liệu cá nhân, quyền của chủ thể dữ liệu, nghĩa vụ của bên xử lý dữ liệu cá nhân. Căn cứ cho module Data & Consent.',
    },
    {
      documentNumber: '13/2012/NĐ-CP',
      title: 'Nghị định ban hành Điều lệ Sáng kiến',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2012-03-02'),
      basisType: 'decree',
      scope: 'conditional',
      summary: 'Quy định về sáng kiến, công nhận sáng kiến, quyền lợi tác giả sáng kiến. Áp dụng cho hoạt động nghiên cứu sáng tạo của Viện.',
    },
    {
      documentNumber: '40/2014/NĐ-CP',
      title: 'Nghị định quy định việc sử dụng, trọng dụng cá nhân hoạt động KH&CN',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2014-05-12'),
      basisType: 'decree',
      scope: 'conditional',
      summary: 'Quy định chính sách đãi ngộ, trọng dụng nhân tài KH&CN. Áp dụng cho chính sách nhân sự chuyên gia của Viện.',
    },
    {
      documentNumber: '70/2018/NĐ-CP',
      title: 'Nghị định quy định việc quản lý, sử dụng tài sản được hình thành thông qua nhiệm vụ KH&CN sử dụng vốn nhà nước',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2018-05-15'),
      basisType: 'decree',
      scope: 'conditional',
      summary: 'Quy định quản lý tài sản trí tuệ từ nghiên cứu có vốn nhà nước. Áp dụng khi Viện nhận tài trợ từ ngân sách.',
    },
    {
      documentNumber: '76/2018/NĐ-CP',
      title: 'Nghị định quy định chi tiết và hướng dẫn thi hành một số điều của Luật Chuyển giao công nghệ',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2018-05-15'),
      basisType: 'decree',
      scope: 'conditional',
      summary: 'Hướng dẫn về chuyển giao công nghệ, hợp đồng chuyển giao, thẩm định công nghệ. Áp dụng cho hoạt động triển khai công nghệ của Viện.',
    },
    {
      documentNumber: '85/2016/NĐ-CP',
      title: 'Nghị định về bảo đảm an toàn hệ thống thông tin theo cấp độ',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2016-07-01'),
      basisType: 'decree',
      scope: 'mandatory',
      summary: 'Quy định phân loại và bảo đảm an toàn hệ thống thông tin theo 5 cấp độ. Áp dụng cho hệ thống IOCM.',
    },
    {
      documentNumber: '53/2022/NĐ-CP',
      title: 'Nghị định quy định chi tiết một số điều của Luật An ninh mạng',
      issuingAuth: 'Chính phủ',
      effectiveDate: new Date('2022-08-15'),
      basisType: 'decree',
      scope: 'mandatory',
      summary: 'Hướng dẫn chi tiết Luật An ninh mạng về bảo vệ dữ liệu, lưu trữ dữ liệu tại Việt Nam. Áp dụng cho hạ tầng CNTT của Viện.',
    },

    // === THÔNG TƯ (Circulars) ===
    {
      documentNumber: '03/2014/TT-BKHCN',
      title: 'Thông tư hướng dẫn điều kiện thành lập và đăng ký hoạt động của tổ chức KH&CN',
      issuingAuth: 'Bộ Khoa học và Công nghệ',
      effectiveDate: new Date('2014-04-30'),
      basisType: 'circular',
      scope: 'mandatory',
      summary: 'Quy định cụ thể về hồ sơ, trình tự, thủ tục thành lập và đăng ký hoạt động tổ chức KH&CN. Căn cứ trực tiếp cho hồ sơ thành lập Viện.',
    },
    {
      documentNumber: '04/2014/TT-BKHCN',
      title: 'Thông tư hướng dẫn đánh giá, nghiệm thu kết quả thực hiện nhiệm vụ KH&CN',
      issuingAuth: 'Bộ Khoa học và Công nghệ',
      effectiveDate: new Date('2014-04-30'),
      basisType: 'circular',
      scope: 'conditional',
      summary: 'Hướng dẫn đánh giá, nghiệm thu nhiệm vụ KH&CN. Áp dụng cho dự án nghiên cứu và KPI của Viện.',
    },
    {
      documentNumber: '03/2017/TT-BTTTT',
      title: 'Thông tư quy định chi tiết và hướng dẫn một số điều của Nghị định 85/2016 về bảo đảm an toàn hệ thống thông tin theo cấp độ',
      issuingAuth: 'Bộ Thông tin và Truyền thông',
      effectiveDate: new Date('2017-04-24'),
      basisType: 'circular',
      scope: 'mandatory',
      summary: 'Hướng dẫn phân loại, xác định cấp độ an toàn hệ thống thông tin. Áp dụng cho việc đánh giá cấp độ ATTT của hệ thống IOCM.',
    },
    {
      documentNumber: '12/2022/TT-BKHCN',
      title: 'Thông tư hướng dẫn quản lý nhiệm vụ KH&CN cấp quốc gia',
      issuingAuth: 'Bộ Khoa học và Công nghệ',
      effectiveDate: new Date('2022-08-12'),
      basisType: 'circular',
      scope: 'conditional',
      summary: 'Hướng dẫn quản lý nhiệm vụ KH&CN cấp quốc gia. Áp dụng khi Viện tham gia đề tài/dự án cấp nhà nước.',
    },
    {
      documentNumber: '20/2014/TT-BKHCN',
      title: 'Thông tư quy định việc nhập khẩu máy móc, thiết bị, dây chuyền công nghệ đã qua sử dụng',
      issuingAuth: 'Bộ Khoa học và Công nghệ',
      effectiveDate: new Date('2014-07-15'),
      basisType: 'circular',
      scope: 'recommended',
      summary: 'Quy định về nhập khẩu thiết bị công nghệ. Tham khảo khi Viện nhập thiết bị nghiên cứu từ nước ngoài.',
    },
  ];

  console.log(`  → Seeding ${legalBases.length} legal bases (Vietnamese laws, decrees, circulars)...`);
  for (const lb of legalBases) {
    await prisma.legalBasis.upsert({
      where: { documentNumber: lb.documentNumber },
      update: {
        title: lb.title,
        issuingAuth: lb.issuingAuth,
        effectiveDate: lb.effectiveDate,
        basisType: lb.basisType,
        scope: lb.scope,
        summary: lb.summary,
        status: 'ACTIVE',
        lastVerified: new Date(),
      },
      create: {
        ...lb,
        status: 'ACTIVE',
        lastVerified: new Date(),
      },
    });
  }
  console.log(`  ✔ ${legalBases.length} legal bases seeded`);


  // --- 4. Seed Admin User ---
  const adminEmail = 'admin@iocm.vn';
  const adminPasswordHash = await bcrypt.hash('Admin@IOCM2025', 12);

  console.log('  → Seeding admin user...');
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      status: 'ACTIVE',
    },
    create: {
      email: adminEmail,
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      status: 'ACTIVE',
    },
  });

  // Assign System_Admin role to admin user
  const systemAdminRole = await prisma.role.findUnique({
    where: { name: 'System_Admin' },
  });

  if (systemAdminRole) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId_scope: {
          userId: adminUser.id,
          roleId: systemAdminRole.id,
          scope: 'org',
        },
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: systemAdminRole.id,
        scope: 'org',
      },
    });
  }
  console.log('  ✔ Admin user seeded (admin@iocm.vn)');

  // --- 5. Seed Sample Document with Completeness Checklist ---
  const checklistQuestions = [
    'Q1. Nội dung bắt buộc đã đủ chưa?',
    'Q2. Căn cứ pháp lý hoặc căn cứ nội bộ đã liên kết chưa?',
    'Q3. Người chịu trách nhiệm đã được gán chưa?',
    'Q4. Tài liệu hỗ trợ đã đính kèm chưa?',
    'Q5. Format/template đã đúng chưa?',
    'Q6. Đã được review chưa?',
    'Q7. Đã được phê duyệt/ký chưa nếu cần?',
    'Q8. Tài liệu có còn hiệu lực không?',
  ];

  console.log('  → Seeding sample document with completeness checklist...');
  const sampleDoc = await prisma.documentItem.upsert({
    where: { code: 'DOC-SEED-001' },
    update: {
      name: 'Điều lệ Viện (Mẫu)',
      type: 'charter',
      cluster: 'CORE_FOUNDING',
      status: 'NOT_STARTED',
      priority: 'CRITICAL',
      riskIfMissing: 'Không thể đăng ký thành lập Viện nếu thiếu Điều lệ',
    },
    create: {
      code: 'DOC-SEED-001',
      name: 'Điều lệ Viện (Mẫu)',
      type: 'charter',
      cluster: 'CORE_FOUNDING',
      status: 'NOT_STARTED',
      priority: 'CRITICAL',
      riskIfMissing: 'Không thể đăng ký thành lập Viện nếu thiếu Điều lệ',
    },
  });

  for (const question of checklistQuestions) {
    const existingCheck = await prisma.completenessCheck.findFirst({
      where: { documentId: sampleDoc.id, question },
    });
    if (!existingCheck) {
      await prisma.completenessCheck.create({
        data: {
          documentId: sampleDoc.id,
          question,
          passed: false,
        },
      });
    }
  }
  console.log('  ✔ Sample document with 8 completeness checks seeded');

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
