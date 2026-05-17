import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================
// COMPLETE DOCUMENT LIBRARY FOR VIETNAMESE S&T RESEARCH INSTITUTE
// Total: 80+ documents across 11 DocumentCluster categories
// ============================================================

type DocSeed = {
  code: string;
  name: string;
  type: string;
  cluster: string;
  priority: string;
  riskIfMissing: string;
};

// --- A. CORE_FOUNDING — Hồ sơ thành lập (FND-01 → FND-17) ---
const coreFounding: DocSeed[] = [
  { code: 'FND-01', name: 'Đơn đăng ký hoạt động KH&CN (Mẫu 5)', type: 'registration_form', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không thể nộp hồ sơ đăng ký nếu thiếu đơn chính thức' },
  { code: 'FND-02', name: 'Quyết định thành lập tổ chức KH&CN', type: 'founding_decision', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không có cơ sở pháp lý cho sự tồn tại của tổ chức' },
  { code: 'FND-03', name: 'Điều lệ tổ chức và hoạt động', type: 'charter', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không có quy định nội bộ về cách vận hành tổ chức' },
  { code: 'FND-04', name: 'Lý lịch khoa học người đứng đầu (Mẫu 11)', type: 'head_person_cv', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không chứng minh được người đứng đầu đủ điều kiện' },
  { code: 'FND-05', name: 'Bản sao bằng cấp người đứng đầu', type: 'head_person_diploma', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Thiếu bằng chứng trình độ người đứng đầu' },
  { code: 'FND-06', name: 'Danh sách nhân lực KH&CN (Mẫu 8)', type: 'personnel_list', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không chứng minh đủ điều kiện nhân lực (≥5 ĐH, ≥40% chính thức)' },
  { code: 'FND-07', name: 'Lý lịch khoa học nhân sự chính thức (Mẫu 9)', type: 'personnel_cv_fulltime', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Thiếu chi tiết nhân sự chính thức — cần cho từng người' },
  { code: 'FND-08', name: 'Lý lịch khoa học nhân sự kiêm nhiệm (Mẫu 10)', type: 'personnel_cv_parttime', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Thiếu chi tiết nhân sự kiêm nhiệm — cần nếu có nhân sự bán thời gian' },
  { code: 'FND-09', name: 'Bản sao bằng cấp nhân sự (tất cả)', type: 'personnel_diplomas', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Không chứng minh trình độ nhân sự kê khai' },
  { code: 'FND-10', name: 'Bảng kê khai cơ sở vật chất - kỹ thuật (Mẫu 12)', type: 'facility_declaration', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không chứng minh có đủ CSVC phục vụ hoạt động KH&CN' },
  { code: 'FND-11', name: 'Hồ sơ trụ sở (HĐ thuê/sở hữu/mượn)', type: 'premises_proof', cluster: 'CORE_FOUNDING', priority: 'CRITICAL', riskIfMissing: 'Không chứng minh có trụ sở hợp lệ' },
  { code: 'FND-12', name: 'Biên bản họp sáng lập viên', type: 'founders_meeting', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Thiếu bằng chứng đồng thuận sáng lập (cần nếu có nhiều sáng lập viên)' },
  { code: 'FND-13', name: 'Danh sách sáng lập viên + CMND/CCCD', type: 'founders_list', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Thiếu thông tin định danh sáng lập viên' },
  { code: 'FND-14', name: 'Đề án thành lập (nội bộ)', type: 'establishment_proposal', cluster: 'CORE_FOUNDING', priority: 'MEDIUM', riskIfMissing: 'Khuyến nghị nội bộ — giúp giải trình mục tiêu, chiến lược' },
  { code: 'FND-15', name: 'Phương án tài chính / Cam kết vốn', type: 'financial_plan', cluster: 'CORE_FOUNDING', priority: 'MEDIUM', riskIfMissing: 'Có thể bị yêu cầu bổ sung nếu cơ quan đăng ký cần' },
  { code: 'FND-16', name: 'Cam kết của nhân sự chính thức', type: 'personnel_commitment', cluster: 'CORE_FOUNDING', priority: 'HIGH', riskIfMissing: 'Cần cam kết bằng văn bản rằng nhân sự sẽ làm việc tại tổ chức' },
  { code: 'FND-17', name: 'Văn bản đồng ý cho kiêm nhiệm (nếu có công chức/viên chức)', type: 'secondment_approval', cluster: 'CORE_FOUNDING', priority: 'MEDIUM', riskIfMissing: 'Bắt buộc nếu nhân sự kiêm nhiệm là công chức/viên chức nhà nước' },
];

// --- B. REGULATIONS — Quy chế / Quy trình nội bộ (REG-01 → REG-17) ---
const regulations: DocSeed[] = [
  { code: 'REG-01', name: 'Quy chế tổ chức và hoạt động (chi tiết hóa Điều lệ)', type: 'internal_regulation', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Thiếu hướng dẫn vận hành chi tiết, gây mâu thuẫn nội bộ' },
  { code: 'REG-02', name: 'Quy chế tài chính nội bộ', type: 'financial_regulation', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Không kiểm soát được thu chi, rủi ro thất thoát tài chính' },
  { code: 'REG-03', name: 'Quy chế quản lý nhân sự', type: 'hr_regulation', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Thiếu cơ sở pháp lý cho quyết định nhân sự, dễ tranh chấp lao động' },
  { code: 'REG-04', name: 'Quy chế quản lý tài sản', type: 'asset_regulation', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Không theo dõi được tài sản, rủi ro mất mát thiết bị' },
  { code: 'REG-05', name: 'Quy trình tiếp nhận và xử lý công việc', type: 'workflow_process', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Công việc xử lý không nhất quán, thiếu trách nhiệm rõ ràng' },
  { code: 'REG-06', name: 'Quy trình quản lý tài liệu và lưu trữ', type: 'document_management', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Tài liệu thất lạc, không truy xuất được khi cần' },
  { code: 'REG-07', name: 'Quy trình họp và ra quyết định', type: 'meeting_process', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Quyết định thiếu minh bạch, không có biên bản làm căn cứ' },
  { code: 'REG-08', name: 'Quy chế bảo mật thông tin', type: 'confidentiality_regulation', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Rò rỉ thông tin nhạy cảm, vi phạm NDA với đối tác' },
  { code: 'REG-09', name: 'Quy trình tiếp nhận hội viên', type: 'membership_process', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Tiếp nhận hội viên không đồng nhất, thiếu tiêu chí đánh giá' },
  { code: 'REG-10', name: 'Quy trình thẩm định đối tác công nghệ', type: 'partner_vetting', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Hợp tác với đối tác không đủ năng lực, rủi ro uy tín và tài chính' },
  { code: 'REG-11', name: 'Quy trình triển khai dự án/pilot', type: 'project_process', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Dự án triển khai không có quy trình, khó kiểm soát tiến độ và chất lượng' },
  { code: 'REG-12', name: 'Quy trình quản lý rủi ro', type: 'risk_management', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Không nhận diện và xử lý rủi ro kịp thời, ảnh hưởng hoạt động' },
  { code: 'REG-13', name: 'Nội quy lao động', type: 'labor_rules', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Vi phạm Bộ luật Lao động — bắt buộc phải có khi có từ 10 lao động' },
  { code: 'REG-14', name: 'Quy chế dân chủ cơ sở', type: 'democracy_regulation', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Vi phạm quy định về thực hiện dân chủ tại cơ sở' },
  { code: 'REG-15', name: 'Quy trình xử lý khiếu nại, tố cáo nội bộ', type: 'complaint_process', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Không có kênh giải quyết mâu thuẫn, dễ leo thang tranh chấp' },
  { code: 'REG-16', name: 'Quy chế hoạt động Hội đồng khoa học (nếu có)', type: 'council_regulation', cluster: 'REGULATIONS', priority: 'MEDIUM', riskIfMissing: 'Hội đồng khoa học hoạt động không có cơ sở, quyết định thiếu hiệu lực' },
  { code: 'REG-17', name: 'Quy trình đánh giá nghiệm thu nhiệm vụ KH&CN', type: 'acceptance_process', cluster: 'REGULATIONS', priority: 'HIGH', riskIfMissing: 'Không đánh giá được chất lượng kết quả nghiên cứu, lãng phí nguồn lực' },
];

// --- C. PERSONNEL — Nhân sự (PER-01 → PER-10) ---
const personnel: DocSeed[] = [
  { code: 'PER-01', name: 'Hợp đồng lao động mẫu (chính thức)', type: 'labor_contract_template', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Vi phạm Bộ luật Lao động, không bảo vệ quyền lợi hai bên' },
  { code: 'PER-02', name: 'Hợp đồng cộng tác viên/kiêm nhiệm mẫu', type: 'collaborator_contract', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Quan hệ lao động không rõ ràng, rủi ro pháp lý về BHXH' },
  { code: 'PER-03', name: 'Bảng mô tả công việc (Job Description) từng vị trí', type: 'job_description', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Nhân sự không rõ trách nhiệm, đánh giá hiệu suất thiếu căn cứ' },
  { code: 'PER-04', name: 'Quy chế lương, thưởng, phúc lợi', type: 'compensation_policy', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Tranh chấp về lương thưởng, không thu hút được nhân tài' },
  { code: 'PER-05', name: 'Quy trình tuyển dụng', type: 'recruitment_process', cluster: 'PERSONNEL', priority: 'MEDIUM', riskIfMissing: 'Tuyển dụng thiếu minh bạch, không đảm bảo chất lượng nhân sự' },
  { code: 'PER-06', name: 'Quy trình đánh giá nhân sự định kỳ', type: 'performance_review', cluster: 'PERSONNEL', priority: 'MEDIUM', riskIfMissing: 'Không có cơ sở khen thưởng/kỷ luật, nhân sự thiếu động lực' },
  { code: 'PER-07', name: 'Kế hoạch đào tạo nhân sự', type: 'training_plan', cluster: 'PERSONNEL', priority: 'MEDIUM', riskIfMissing: 'Nhân sự không phát triển năng lực, tụt hậu so với yêu cầu' },
  { code: 'PER-08', name: 'Cam kết bảo mật của nhân viên (NDA nội bộ)', type: 'employee_nda', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Nhân viên rời đi mang theo thông tin mật, không có căn cứ xử lý' },
  { code: 'PER-09', name: 'Sổ theo dõi nghỉ phép, công tác', type: 'leave_tracking', cluster: 'PERSONNEL', priority: 'MEDIUM', riskIfMissing: 'Không quản lý được ngày phép, tranh chấp về chế độ nghỉ' },
  { code: 'PER-10', name: 'Quy định về đạo đức nghề nghiệp và xung đột lợi ích', type: 'ethics_policy', cluster: 'PERSONNEL', priority: 'HIGH', riskIfMissing: 'Xung đột lợi ích không được phát hiện, ảnh hưởng uy tín tổ chức' },
];

// --- D. PARTNERSHIP — Đối tác & Hội viên (PTN-01 → PTN-12) ---
const partnership: DocSeed[] = [
  { code: 'PTN-01', name: 'Mẫu Biên bản ghi nhớ (MOU)', type: 'mou_template', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Thiếu khung hợp tác ban đầu, đối tác không rõ cam kết' },
  { code: 'PTN-02', name: 'Mẫu Thỏa thuận bảo mật (NDA)', type: 'nda_template', cluster: 'PARTNERSHIP', priority: 'HIGH', riskIfMissing: 'Chia sẻ thông tin mật không có ràng buộc pháp lý bảo vệ' },
  { code: 'PTN-03', name: 'Mẫu Hợp đồng hợp tác nghiên cứu', type: 'research_agreement', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Tranh chấp quyền sở hữu trí tuệ từ kết quả nghiên cứu chung' },
  { code: 'PTN-04', name: 'Mẫu Hợp đồng triển khai công nghệ', type: 'tech_deployment_contract', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Không rõ trách nhiệm khi triển khai thất bại hoặc gây thiệt hại' },
  { code: 'PTN-05', name: 'Mẫu Hợp đồng tài trợ/sponsorship', type: 'sponsorship_contract', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Nhà tài trợ không rõ quyền lợi, dễ phát sinh tranh chấp' },
  { code: 'PTN-06', name: 'Mẫu Thỏa thuận chia sẻ dữ liệu (DSA)', type: 'data_sharing_agreement', cluster: 'PARTNERSHIP', priority: 'HIGH', riskIfMissing: 'Vi phạm NĐ 13/2023 về bảo vệ DLCN khi chia sẻ dữ liệu không có thỏa thuận' },
  { code: 'PTN-07', name: 'Mẫu Thỏa thuận xử lý dữ liệu (DPA)', type: 'data_processing_agreement', cluster: 'PARTNERSHIP', priority: 'HIGH', riskIfMissing: 'Bên xử lý dữ liệu không có ràng buộc pháp lý, rủi ro vi phạm DLCN' },
  { code: 'PTN-08', name: 'Mẫu Hợp đồng SLA (Service Level Agreement)', type: 'sla_template', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Không có cam kết chất lượng dịch vụ, khó đòi bồi thường khi vi phạm' },
  { code: 'PTN-09', name: 'Phiếu thẩm định đối tác (Due Diligence Checklist)', type: 'due_diligence_form', cluster: 'PARTNERSHIP', priority: 'HIGH', riskIfMissing: 'Hợp tác với đối tác có vấn đề pháp lý/tài chính mà không biết' },
  { code: 'PTN-10', name: 'Mẫu đơn gia nhập hội viên', type: 'membership_application', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Không thu thập đủ thông tin hội viên, khó quản lý sau này' },
  { code: 'PTN-11', name: 'Thỏa thuận hội viên (Membership Agreement)', type: 'membership_agreement', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Hội viên không rõ quyền và nghĩa vụ, dễ tranh chấp' },
  { code: 'PTN-12', name: 'Mẫu báo cáo hợp tác định kỳ', type: 'partnership_report', cluster: 'PARTNERSHIP', priority: 'MEDIUM', riskIfMissing: 'Không theo dõi được hiệu quả hợp tác, khó ra quyết định tiếp tục/dừng' },
];

// --- E. CONTRACTS — Hợp đồng mẫu khác (CTR-01 → CTR-05) ---
const contracts: DocSeed[] = [
  { code: 'CTR-01', name: 'Mẫu hợp đồng thuê văn phòng/trụ sở', type: 'office_lease', cluster: 'CONTRACTS', priority: 'MEDIUM', riskIfMissing: 'Thuê trụ sở không có hợp đồng chuẩn, rủi ro bị đuổi hoặc tăng giá đột ngột' },
  { code: 'CTR-02', name: 'Mẫu hợp đồng mua sắm thiết bị', type: 'procurement_contract', cluster: 'CONTRACTS', priority: 'MEDIUM', riskIfMissing: 'Mua thiết bị không có bảo hành/điều khoản rõ ràng' },
  { code: 'CTR-03', name: 'Mẫu hợp đồng dịch vụ CNTT', type: 'it_service_contract', cluster: 'CONTRACTS', priority: 'MEDIUM', riskIfMissing: 'Dịch vụ CNTT gián đoạn không có căn cứ yêu cầu bồi thường' },
  { code: 'CTR-04', name: 'Mẫu hợp đồng tư vấn chuyên gia', type: 'consulting_contract', cluster: 'CONTRACTS', priority: 'MEDIUM', riskIfMissing: 'Chuyên gia tư vấn không có ràng buộc về bảo mật và chất lượng' },
  { code: 'CTR-05', name: 'Mẫu hợp đồng chuyển giao công nghệ', type: 'tech_transfer_contract', cluster: 'CONTRACTS', priority: 'MEDIUM', riskIfMissing: 'Chuyển giao công nghệ không rõ phạm vi, quyền sở hữu, bảo hành' },
];

// --- F. TECHNOLOGY — Công nghệ & Sản phẩm (TECH-01 → TECH-07) ---
const technology: DocSeed[] = [
  { code: 'TECH-01', name: 'Quy trình đánh giá sản phẩm công nghệ (Product Review)', type: 'product_review_process', cluster: 'TECHNOLOGY', priority: 'MEDIUM', riskIfMissing: 'Đánh giá sản phẩm không có tiêu chí thống nhất, thiếu khách quan' },
  { code: 'TECH-02', name: 'Mẫu Hộ chiếu sản phẩm (Product Passport)', type: 'product_passport', cluster: 'TECHNOLOGY', priority: 'MEDIUM', riskIfMissing: 'Không có hồ sơ đầy đủ về sản phẩm để giới thiệu cho đối tác' },
  { code: 'TECH-03', name: 'Quy trình triển khai pilot', type: 'pilot_process', cluster: 'TECHNOLOGY', priority: 'MEDIUM', riskIfMissing: 'Pilot triển khai không có quy trình, khó đánh giá thành công/thất bại' },
  { code: 'TECH-04', name: 'Mẫu báo cáo kết quả pilot', type: 'pilot_report', cluster: 'TECHNOLOGY', priority: 'MEDIUM', riskIfMissing: 'Không ghi nhận bài học từ pilot, lặp lại sai lầm' },
  { code: 'TECH-05', name: 'Quy trình đánh giá rủi ro AI', type: 'ai_risk_assessment', cluster: 'TECHNOLOGY', priority: 'HIGH', riskIfMissing: 'Triển khai AI không đánh giá rủi ro, vi phạm nguyên tắc AI có trách nhiệm' },
  { code: 'TECH-06', name: 'Chính sách sử dụng AI có trách nhiệm', type: 'responsible_ai_policy', cluster: 'TECHNOLOGY', priority: 'HIGH', riskIfMissing: 'Không có khung đạo đức AI, rủi ro uy tín và pháp lý khi AI gây hại' },
  { code: 'TECH-07', name: 'Quy trình kiểm thử bảo mật sản phẩm', type: 'security_testing_process', cluster: 'TECHNOLOGY', priority: 'HIGH', riskIfMissing: 'Sản phẩm có lỗ hổng bảo mật không được phát hiện trước khi triển khai' },
];

// --- G. DATA — Dữ liệu & Bảo vệ DLCN (DATA-01 → DATA-08) ---
const dataProtection: DocSeed[] = [
  { code: 'DATA-01', name: 'Chính sách bảo vệ dữ liệu cá nhân', type: 'data_protection_policy', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Vi phạm NĐ 13/2023, bị phạt hành chính và mất uy tín' },
  { code: 'DATA-02', name: 'Quy trình thu thập và xử lý DLCN', type: 'data_processing_procedure', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Thu thập dữ liệu không đúng quy trình, vi phạm quyền chủ thể dữ liệu' },
  { code: 'DATA-03', name: 'Mẫu phiếu đồng ý (Consent Form)', type: 'consent_form', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Xử lý DLCN không có sự đồng ý hợp lệ, vi phạm pháp luật' },
  { code: 'DATA-04', name: 'Quy trình xử lý yêu cầu chủ thể dữ liệu (DSAR)', type: 'dsar_process', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Không đáp ứng yêu cầu chủ thể dữ liệu trong thời hạn luật định' },
  { code: 'DATA-05', name: 'Đánh giá tác động bảo vệ dữ liệu (DPIA) mẫu', type: 'dpia_template', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Không đánh giá rủi ro trước khi xử lý dữ liệu nhạy cảm' },
  { code: 'DATA-06', name: 'Sổ hoạt động xử lý dữ liệu (ROPA)', type: 'ropa', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Không có hồ sơ hoạt động xử lý dữ liệu theo yêu cầu NĐ 13/2023' },
  { code: 'DATA-07', name: 'Quy trình thông báo vi phạm dữ liệu', type: 'breach_notification', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Không thông báo vi phạm dữ liệu trong 72h theo quy định, bị phạt nặng' },
  { code: 'DATA-08', name: 'Chính sách phân loại và lưu trữ dữ liệu', type: 'data_classification', cluster: 'DATA', priority: 'HIGH', riskIfMissing: 'Dữ liệu nhạy cảm không được bảo vệ đúng mức, rủi ro rò rỉ' },
];

// --- H. FINANCE — Tài chính (FIN-01 → FIN-07) ---
const finance: DocSeed[] = [
  { code: 'FIN-01', name: 'Kế hoạch tài chính năm đầu', type: 'financial_plan', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Không có kế hoạch tài chính, chi tiêu không kiểm soát' },
  { code: 'FIN-02', name: 'Mẫu dự toán ngân sách dự án', type: 'budget_template', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Dự án vượt ngân sách do không có dự toán ban đầu' },
  { code: 'FIN-03', name: 'Quy trình thanh toán và phê duyệt chi', type: 'payment_process', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Chi tiêu không được phê duyệt đúng cấp, rủi ro lạm dụng' },
  { code: 'FIN-04', name: 'Mẫu hóa đơn phí hội viên', type: 'membership_invoice', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Thu phí hội viên không có chứng từ, khó quyết toán thuế' },
  { code: 'FIN-05', name: 'Quy trình quản lý quỹ tài trợ', type: 'grant_management', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Sử dụng quỹ tài trợ sai mục đích, mất uy tín với nhà tài trợ' },
  { code: 'FIN-06', name: 'Mẫu báo cáo tài chính định kỳ', type: 'financial_report', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Không có báo cáo tài chính minh bạch cho ban lãnh đạo và hội viên' },
  { code: 'FIN-07', name: 'Quy trình kiểm toán nội bộ', type: 'internal_audit', cluster: 'FINANCE', priority: 'MEDIUM', riskIfMissing: 'Không phát hiện sai sót tài chính kịp thời, rủi ro gian lận' },
];

// --- I. SECURITY — Bảo mật & ATTT (SEC-01 → SEC-07) ---
const security: DocSeed[] = [
  { code: 'SEC-01', name: 'Chính sách an toàn thông tin', type: 'infosec_policy', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Không có khung bảo mật tổng thể, hệ thống dễ bị tấn công' },
  { code: 'SEC-02', name: 'Quy trình quản lý tài khoản và quyền truy cập', type: 'access_control', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Tài khoản không được quản lý, nhân viên cũ vẫn truy cập hệ thống' },
  { code: 'SEC-03', name: 'Quy trình sao lưu và phục hồi dữ liệu', type: 'backup_recovery', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Mất dữ liệu không thể phục hồi khi sự cố xảy ra' },
  { code: 'SEC-04', name: 'Kế hoạch ứng phó sự cố ATTT', type: 'incident_response', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Phản ứng chậm khi bị tấn công, thiệt hại lan rộng' },
  { code: 'SEC-05', name: 'Quy trình quản lý thiết bị và phần mềm', type: 'device_management', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Thiết bị không được cập nhật bảo mật, trở thành điểm yếu' },
  { code: 'SEC-06', name: 'Chính sách sử dụng email và internet', type: 'acceptable_use', cluster: 'SECURITY', priority: 'MEDIUM', riskIfMissing: 'Nhân viên sử dụng email/internet không an toàn, rủi ro phishing' },
  { code: 'SEC-07', name: 'Quy trình đánh giá an toàn hệ thống định kỳ', type: 'security_assessment', cluster: 'SECURITY', priority: 'HIGH', riskIfMissing: 'Lỗ hổng bảo mật tồn tại lâu không được phát hiện' },
];

// --- J. REPORTING — Báo cáo (RPT-01 → RPT-05) ---
const reporting: DocSeed[] = [
  { code: 'RPT-01', name: 'Mẫu báo cáo hoạt động KH&CN hàng năm (Mẫu 12 báo cáo)', type: 'annual_st_report', cluster: 'REPORTING', priority: 'MEDIUM', riskIfMissing: 'Không nộp báo cáo hàng năm cho cơ quan quản lý, vi phạm quy định' },
  { code: 'RPT-02', name: 'Mẫu báo cáo kết quả dự án', type: 'project_result_report', cluster: 'REPORTING', priority: 'MEDIUM', riskIfMissing: 'Không ghi nhận kết quả dự án, khó quyết toán và đánh giá hiệu quả' },
  { code: 'RPT-03', name: 'Mẫu báo cáo tác động (Impact Report)', type: 'impact_report', cluster: 'REPORTING', priority: 'MEDIUM', riskIfMissing: 'Không chứng minh được giá trị tạo ra cho hội viên và xã hội' },
  { code: 'RPT-04', name: 'Mẫu báo cáo tuân thủ pháp luật', type: 'compliance_report', cluster: 'REPORTING', priority: 'MEDIUM', riskIfMissing: 'Không theo dõi được mức độ tuân thủ, rủi ro vi phạm không biết' },
  { code: 'RPT-05', name: 'Mẫu báo cáo tài chính cho nhà tài trợ', type: 'donor_financial_report', cluster: 'REPORTING', priority: 'MEDIUM', riskIfMissing: 'Nhà tài trợ không nhận được báo cáo, mất niềm tin và nguồn tài trợ' },
];

// ============================================================
// COMBINE ALL DOCUMENTS
// ============================================================
const allDocuments: DocSeed[] = [
  ...coreFounding,
  ...regulations,
  ...personnel,
  ...partnership,
  ...contracts,
  ...technology,
  ...dataProtection,
  ...finance,
  ...security,
  ...reporting,
];

// ============================================================
// MAIN SEED FUNCTION
// ============================================================
async function main() {
  console.log('📚 Seeding COMPLETE document library for Vietnamese S&T Research Institute...');
  console.log(`   Total documents to seed: ${allDocuments.length}`);
  console.log('');

  let created = 0;
  let updated = 0;

  for (const doc of allDocuments) {
    const result = await prisma.documentItem.upsert({
      where: { code: doc.code },
      update: {
        name: doc.name,
        type: doc.type,
        cluster: doc.cluster as any,
        priority: doc.priority as any,
        riskIfMissing: doc.riskIfMissing,
      },
      create: {
        code: doc.code,
        name: doc.name,
        type: doc.type,
        cluster: doc.cluster as any,
        status: 'NOT_STARTED',
        priority: doc.priority as any,
        riskIfMissing: doc.riskIfMissing,
      },
    });

    // Check if it was created or updated by comparing createdAt and updatedAt
    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    if (isNew) created++;
    else updated++;
  }

  // Print summary by cluster
  console.log('  ┌─────────────────────────────────────────────────────────┐');
  console.log('  │ CLUSTER              │ COUNT │ PRIORITY BREAKDOWN       │');
  console.log('  ├─────────────────────────────────────────────────────────┤');

  const clusters = [
    { name: 'CORE_FOUNDING', label: 'A. Hồ sơ thành lập', docs: coreFounding },
    { name: 'REGULATIONS', label: 'B. Quy chế nội bộ', docs: regulations },
    { name: 'PERSONNEL', label: 'C. Nhân sự', docs: personnel },
    { name: 'PARTNERSHIP', label: 'D. Đối tác & Hội viên', docs: partnership },
    { name: 'CONTRACTS', label: 'E. Hợp đồng mẫu', docs: contracts },
    { name: 'TECHNOLOGY', label: 'F. Công nghệ', docs: technology },
    { name: 'DATA', label: 'G. Dữ liệu & DLCN', docs: dataProtection },
    { name: 'FINANCE', label: 'H. Tài chính', docs: finance },
    { name: 'SECURITY', label: 'I. Bảo mật & ATTT', docs: security },
    { name: 'REPORTING', label: 'J. Báo cáo', docs: reporting },
  ];

  for (const c of clusters) {
    const critical = c.docs.filter(d => d.priority === 'CRITICAL').length;
    const high = c.docs.filter(d => d.priority === 'HIGH').length;
    const medium = c.docs.filter(d => d.priority === 'MEDIUM').length;
    const breakdown = [
      critical > 0 ? `${critical} CRITICAL` : '',
      high > 0 ? `${high} HIGH` : '',
      medium > 0 ? `${medium} MEDIUM` : '',
    ].filter(Boolean).join(', ');
    console.log(`  │ ${c.label.padEnd(20)} │  ${String(c.docs.length).padStart(2)}  │ ${breakdown.padEnd(24)} │`);
  }

  console.log('  └─────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`  📊 Results: ${created} created, ${updated} updated`);
  console.log(`  📋 Total documents in library: ${allDocuments.length}`);
  console.log('');
  console.log('✅ Complete document library seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
