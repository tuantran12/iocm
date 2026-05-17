-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "DocumentCluster" AS ENUM ('CORE_FOUNDING', 'REGULATIONS', 'PERSONNEL', 'PARTNERSHIP', 'CONTRACTS', 'TECHNOLOGY', 'DATA', 'PILOT', 'FINANCE', 'SECURITY', 'REPORTING');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_STARTED', 'DRAFTING', 'NEEDS_INFO', 'IN_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Confidentiality" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET');

-- CreateEnum
CREATE TYPE "LegalStatus" AS ENUM ('ACTIVE', 'EXPIRING', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PROSPECT', 'INVITED', 'APPLICATION_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'PAYMENT_OVERDUE', 'SUSPENDED', 'TERMINATED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_INVOICED', 'INVOICED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('R1', 'R2', 'R3', 'R4', 'R5');

-- CreateEnum
CREATE TYPE "GroupType" AS ENUM ('CORE', 'COUNCIL', 'ENTERPRISE', 'DOMAIN', 'PROJECT', 'PILOT', 'LEGAL', 'DATA', 'SPONSOR', 'COMMUNITY', 'PRIVATE_PARTNER');

-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PUBLIC_TO_MEMBERS', 'PRIVATE_INVITE_ONLY', 'CORE_ONLY', 'PROJECT_ONLY', 'COUNCIL_ONLY', 'ENTERPRISE_PRIVATE');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('OWNER', 'MODERATOR', 'MEMBER', 'OBSERVER', 'EXTERNAL_EXPERT', 'ENTERPRISE_REP');

-- CreateEnum
CREATE TYPE "GroupMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'FILE', 'LINK', 'SYSTEM_NOTICE', 'TASK_REF', 'DECISION_REF', 'POLL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgreementType" AS ENUM ('MEMBERSHIP', 'MOU', 'NDA', 'DPA', 'SLA', 'TECH_DEPLOYMENT', 'TECH_TRANSFER', 'SPONSORSHIP', 'RESEARCH', 'DATA_SHARING', 'EVENT');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'LEGAL_REVIEW', 'NEGOTIATION', 'PENDING_SIGNATURE', 'SIGNED', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'TERMINATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'PILOT_READY', 'DEPLOYED', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSED', 'PLANNING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KPIType" AS ENUM ('OUTPUT', 'OUTCOME', 'IMPACT', 'SAFETY', 'SATISFACTION', 'INCLUSION', 'SUSTAINABILITY');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT NOT NULL,
    "twoFactor" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scope" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "beforeVal" JSONB,
    "afterVal" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "cluster" "DocumentCluster" NOT NULL DEFAULT 'CORE_FOUNDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DocumentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ownerId" TEXT,
    "reviewerId" TEXT,
    "approverId" TEXT,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'INTERNAL',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "deadline" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "riskIfMissing" TEXT,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentComment" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalBasis" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuingAuth" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "LegalStatus" NOT NULL DEFAULT 'ACTIVE',
    "basisType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "summary" TEXT,
    "fullTextUrl" TEXT,
    "lastVerified" TIMESTAMP(3),
    "verifiedBy" TEXT,

    CONSTRAINT "LegalBasis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLegalBasis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "legalBasisId" TEXT NOT NULL,

    CONSTRAINT "DocumentLegalBasis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletenessCheck" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletenessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseMember" (
    "id" TEXT NOT NULL,
    "legalNameVi" TEXT NOT NULL,
    "legalNameEn" TEXT,
    "taxCode" TEXT,
    "businessRegNumber" TEXT,
    "legalRepresentative" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "website" TEXT,
    "industrySector" TEXT,
    "technologyDomains" TEXT[],
    "companySize" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "membershipTierId" TEXT NOT NULL,
    "membershipStatus" "MembershipStatus" NOT NULL DEFAULT 'PROSPECT',
    "joinedDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "riskRating" "RiskRating",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "annualFee" DECIMAL(65,30) NOT NULL,
    "benefits" JSONB NOT NULL,
    "accessRights" JSONB NOT NULL,
    "votingRight" BOOLEAN NOT NULL DEFAULT false,
    "projectRight" BOOLEAN NOT NULL DEFAULT false,
    "maxUsers" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipFee" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amountDue" DECIMAL(65,30) NOT NULL,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "invoiceNumber" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'NOT_INVOICED',
    "paymentProof" TEXT,
    "waiverStatus" BOOLEAN NOT NULL DEFAULT false,
    "waiverReason" TEXT,
    "approvedBy" TEXT,

    CONSTRAINT "MembershipFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GroupType" NOT NULL,
    "description" TEXT,
    "goal" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "visibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE_INVITE_ONLY',
    "membershipPolicy" TEXT NOT NULL DEFAULT 'invite_only',
    "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "groupRole" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedBy" TEXT,
    "status" "GroupMemberStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "replyToId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedTo" TEXT,
    "createdBy" TEXT NOT NULL,
    "groupId" TEXT,
    "projectId" TEXT,
    "documentId" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupDecision" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "proposedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgreementRecord" (
    "id" TEXT NOT NULL,
    "type" "AgreementType" NOT NULL,
    "title" TEXT NOT NULL,
    "partyA" TEXT NOT NULL,
    "partyB" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "partnerId" TEXT,
    "projectId" TEXT,
    "productId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "signedFileUrl" TEXT,
    "keyObligations" JSONB,
    "renewalNotice" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgreementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorshipRecord" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "sponsorName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "purpose" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "agreementId" TEXT,
    "reportingDue" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'committed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorshipRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipAgreement" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "annualFee" DECIMAL(65,30) NOT NULL,
    "signedFileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipAgreementVersion" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeNote" TEXT,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseUser" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInOrg" TEXT,

    CONSTRAINT "EnterpriseUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingMinutes" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "participants" JSONB NOT NULL,
    "agenda" TEXT,
    "summary" TEXT,
    "decisions" JSONB,
    "actionItems" JSONB,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnologyPartner" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "companyName" TEXT NOT NULL,
    "taxCode" TEXT,
    "legalRepresentative" TEXT,
    "address" TEXT,
    "technologyDomains" TEXT[],
    "coreProducts" TEXT[],
    "certifications" TEXT[],
    "riskRating" "RiskRating",
    "relationshipStatus" TEXT NOT NULL DEFAULT 'new',
    "lastReviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnologyPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DueDiligence" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "reviewers" JSONB NOT NULL,
    "legalScore" INTEGER,
    "technicalScore" INTEGER,
    "securityScore" INTEGER,
    "dataScore" INTEGER,
    "aiScore" INTEGER,
    "overallScore" INTEGER,
    "riskRating" "RiskRating",
    "decision" TEXT,
    "conditions" TEXT,
    "nextReview" TIMESTAMP(3),

    CONSTRAINT "DueDiligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnologyProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "partnerId" TEXT,
    "enterpriseId" TEXT,
    "technologyDomain" TEXT,
    "deploymentModel" TEXT,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "riskClassification" TEXT,
    "licenseType" TEXT,
    "securityStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
    "dataReviewStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
    "aiReviewStatus" TEXT NOT NULL DEFAULT 'not_reviewed',
    "status" "ProductStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnologyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "goal" TEXT,
    "targetGroup" TEXT,
    "ownerId" TEXT NOT NULL,
    "sponsorId" TEXT,
    "groupId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PROPOSED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budget" DECIMAL(65,30),
    "riskLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PilotDeployment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productId" TEXT,
    "deploymentArea" TEXT NOT NULL,
    "beneficiaryGroup" TEXT,
    "consentStrategy" TEXT,
    "riskAssessment" TEXT,
    "successCriteria" JSONB,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KPIMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "KPIType" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'increase_is_good',
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "dataSource" TEXT,
    "frequency" TEXT,
    "responsible" TEXT,
    "lastMeasured" TIMESTAMP(3),
    "evidenceUrl" TEXT,

    CONSTRAINT "KPIMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "stewardId" TEXT,
    "confidentiality" "Confidentiality" NOT NULL DEFAULT 'INTERNAL',
    "personalDataLevel" TEXT NOT NULL DEFAULT 'none',
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "collectionMethod" TEXT,
    "legalBasis" TEXT,
    "retentionPeriod" TEXT,
    "storageLocation" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "productId" TEXT,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "projectId" TEXT,
    "datasetId" TEXT,
    "purpose" TEXT NOT NULL,
    "dataTypes" TEXT[],
    "thirdParty" TEXT,
    "consentMethod" TEXT NOT NULL,
    "consentDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "withdrawalDate" TIMESTAMP(3),
    "status" "ConsentStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentUrl" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "assignedTo" TEXT,
    "deadline" TIMESTAMP(3),
    "decision" TEXT,
    "actionTaken" TEXT,
    "closedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "organizerId" TEXT NOT NULL,
    "groupId" TEXT,
    "eligibleTiers" TEXT[],
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "capacity" INTEGER,
    "registration" BOOLEAN NOT NULL DEFAULT false,
    "materialsUrl" TEXT,
    "minutesUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'registered',

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRule" (
    "id" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "retentionPeriod" TEXT NOT NULL,
    "legalBasis" TEXT,
    "archiveMethod" TEXT,
    "deletionMethod" TEXT,
    "approvalNeeded" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RetentionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_scope_key" ON "UserRole"("userId", "roleId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentItem_code_key" ON "DocumentItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LegalBasis_documentNumber_key" ON "LegalBasis"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLegalBasis_documentId_legalBasisId_key" ON "DocumentLegalBasis"("documentId", "legalBasisId");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseMember_taxCode_key" ON "EnterpriseMember"("taxCode");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipTier_name_key" ON "MembershipTier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseUser_enterpriseId_userId_key" ON "EnterpriseUser"("enterpriseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRule_objectType_key" ON "RetentionRule"("objectType");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentComment" ADD CONSTRAINT "DocumentComment_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DocumentComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLegalBasis" ADD CONSTRAINT "DocumentLegalBasis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLegalBasis" ADD CONSTRAINT "DocumentLegalBasis_legalBasisId_fkey" FOREIGN KEY ("legalBasisId") REFERENCES "LegalBasis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletenessCheck" ADD CONSTRAINT "CompletenessCheck_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseMember" ADD CONSTRAINT "EnterpriseMember_membershipTierId_fkey" FOREIGN KEY ("membershipTierId") REFERENCES "MembershipTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFee" ADD CONSTRAINT "MembershipFee_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupDecision" ADD CONSTRAINT "GroupDecision_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementRecord" ADD CONSTRAINT "AgreementRecord_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgreementRecord" ADD CONSTRAINT "AgreementRecord_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "TechnologyPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipRecord" ADD CONSTRAINT "SponsorshipRecord_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAgreement" ADD CONSTRAINT "MembershipAgreement_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAgreement" ADD CONSTRAINT "MembershipAgreement_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "MembershipTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipAgreementVersion" ADD CONSTRAINT "MembershipAgreementVersion_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "MembershipAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseUser" ADD CONSTRAINT "EnterpriseUser_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "EnterpriseMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WorkingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDiligence" ADD CONSTRAINT "DueDiligence_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "TechnologyPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnologyProduct" ADD CONSTRAINT "TechnologyProduct_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "TechnologyPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotDeployment" ADD CONSTRAINT "PilotDeployment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotDeployment" ADD CONSTRAINT "PilotDeployment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "TechnologyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KPIMetric" ADD CONSTRAINT "KPIMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
