-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PRODUCTION_MANAGER', 'EDITOR', 'CLIENT', 'VISITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'IDR', 'USD');

-- CreateEnum
CREATE TYPE "FxSource" AS ENUM ('IDENTITY', 'MANUAL', 'REFERENCE_TABLE');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('INVITE', 'RESET');

-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'INACTIVE', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'MESSAGE', 'STAGE_CHANGE', 'TASK');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('INTERNAL', 'ADMIN_ONLY');

-- CreateEnum
CREATE TYPE "EditorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EditorLevel" AS ENUM ('JUNIOR', 'INTERMEDIATE', 'SENIOR', 'EXPERT');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('PREMIERE_PRO', 'AFTER_EFFECTS', 'DAVINCI_RESOLVE', 'CAPCUT', 'RUSH_PREP', 'SUBTITLING', 'MOTION_DESIGN', 'COLOR_GRADING', 'SOUND_DESIGN', 'THUMBNAIL');

-- CreateEnum
CREATE TYPE "VideoType" AS ENUM ('REEL', 'SHORT', 'YOUTUBE', 'VLOG', 'PODCAST', 'VSL', 'AD', 'INTRO', 'MOTION_DESIGN', 'OTHER');

-- CreateEnum
CREATE TYPE "RateMode" AS ENUM ('PER_VIDEO', 'HOURLY', 'PER_FINAL_MINUTE', 'DAILY', 'MONTHLY_ENVELOPE');

-- CreateEnum
CREATE TYPE "MinuteRounding" AS ENUM ('EXACT_SECOND', 'CEIL_HALF_MINUTE', 'CEIL_MINUTE');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('TO_PREPARE', 'WAITING_RUSHES', 'TO_ASSIGN', 'ASSIGNED', 'EDITING', 'INTERNAL_REVIEW', 'INTERNAL_CHANGES', 'CLIENT_REVIEW', 'CLIENT_CHANGES', 'APPROVED', 'DELIVERED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LinkKind" AS ENUM ('RUSHES', 'DOCUMENT', 'REVIEW', 'FINAL_EXPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('EDIT', 'RUSH_PREP', 'MOTION', 'SUBTITLES', 'COLOR', 'SOUND', 'THUMBNAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('PENDING', 'CHANGES_REQUESTED', 'APPROVED_INTERNAL', 'APPROVED_CLIENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('INCLUDED', 'INTERNAL_ERROR', 'OUT_OF_SCOPE');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeadlineField" AS ENUM ('VIDEO_INTERNAL', 'VIDEO_CLIENT', 'ASSIGNMENT_DUE', 'PROJECT_CLIENT');

-- CreateEnum
CREATE TYPE "AllocationMethod" AS ENUM ('EQUAL', 'WEIGHTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('ACCEPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'DEPOSIT', 'FINAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'PAYPAL', 'WISE', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('ASSIGNMENT', 'PURCHASE', 'ENVELOPE', 'ADDITIONAL');

-- CreateEnum
CREATE TYPE "CostStage" AS ENUM ('ESTIMATED', 'COMMITTED', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RetainerStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "CarryOverPolicy" AS ENUM ('NONE', 'NEXT_PERIOD', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "AttachmentOwner" AS ENUM ('CLIENT', 'PROJECT', 'VIDEO', 'INVOICE', 'CREDIT_NOTE', 'CLIENT_PAYMENT', 'SUPPLIER_PAYMENT', 'EXPENSE', 'EDITOR', 'SETTINGS', 'USER', 'LEGACY_PAYMENT', 'DIRECT_COST');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT_CREATED', 'DEADLINE_SOON', 'OVERDUE', 'NEW_FEEDBACK', 'VALIDATION_PENDING', 'MARGIN_BELOW_THRESHOLD', 'MISSING_COST');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('TO_RECONCILE', 'LINKED_INVOICE', 'LINKED_PAYMENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('DRY_RUN', 'APPLY');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueLevel" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "OverheadMethod" AS ENUM ('NONE', 'HOURS', 'REVENUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VISITOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "financeAccess" BOOLEAN NOT NULL DEFAULT false,
    "legacyRole" TEXT,
    "suggestedRole" "Role",
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Avencao',
    "logoAttachmentId" TEXT,
    "reportingCurrency" "Currency" NOT NULL DEFAULT 'EUR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Makassar',
    "marginThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "ownerHourlyRate" DECIMAL(18,2),
    "ownerTimeIncludedInCosts" BOOLEAN NOT NULL DEFAULT false,
    "defaultIncludedRevisions" INTEGER NOT NULL DEFAULT 2,
    "revisionRoundDefinition" TEXT NOT NULL DEFAULT 'Un aller-retour = un envoi de version suivi d''une liste de retours consolidée.',
    "productionErrorPolicy" TEXT NOT NULL DEFAULT 'Les corrections dues à une erreur de production ne consomment pas d''aller-retour.',
    "defaultMinuteRounding" "MinuteRounding" NOT NULL DEFAULT 'CEIL_MINUTE',
    "nonRecoverableVatInCost" BOOLEAN NOT NULL DEFAULT true,
    "overheadMethod" "OverheadMethod" NOT NULL DEFAULT 'NONE',
    "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "videoRefPrefix" TEXT NOT NULL DEFAULT 'AV',
    "deadlineSoonDays" INTEGER NOT NULL DEFAULT 3,
    "maxUploadMb" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgencySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "unitsPerEur" DECIMAL(20,10) NOT NULL,
    "source" "FxSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" "ClientKind" NOT NULL DEFAULT 'COMPANY',
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "country" TEXT,
    "billingAddress" TEXT,
    "vatNumber" TEXT,
    "companyRegistration" TEXT,
    "website" TEXT,
    "instagram" TEXT,
    "tiktok" TEXT,
    "youtube" TEXT,
    "linkedin" TEXT,
    "otherSocial" TEXT,
    "acquisitionSource" TEXT,
    "ownerId" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "paymentTermsDays" INTEGER,
    "driveUrl" TEXT,
    "creativePreferences" TEXT,
    "references" TEXT,
    "internalNotes" TEXT,
    "nextFollowUpOn" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTag" (
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "services" "VideoType"[],
    "servicesNote" TEXT,
    "estimatedAmount" DECIMAL(18,2),
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "probability" DECIMAL(5,2),
    "expectedCloseOn" DATE,
    "nextAction" TEXT,
    "followUpOn" DATE,
    "lostReason" TEXT,
    "ownerId" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "projectId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "opportunityId" TEXT,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "videoId" TEXT,
    "editorId" TEXT,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "legacySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "country" TEXT,
    "timezone" TEXT,
    "languages" TEXT[],
    "avatarUrl" TEXT,
    "portfolioUrl" TEXT,
    "skills" "Skill"[],
    "formats" "VideoType"[],
    "level" "EditorLevel",
    "availabilityNote" TEXT,
    "status" "EditorStatus" NOT NULL DEFAULT 'ACTIVE',
    "payCurrency" "Currency" NOT NULL DEFAULT 'EUR',
    "paymentTerms" TEXT,
    "internalNotes" TEXT,
    "privateAppraisal" TEXT,
    "weeklyCapacityHours" DECIMAL(6,2),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EditorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorUnavailability" (
    "id" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCard" (
    "id" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "videoType" "VideoType",
    "productionRole" "AssignmentRole",
    "mode" "RateMode" NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "unitLabel" TEXT,
    "defaultQuantity" DECIMAL(12,3),
    "minuteRounding" "MinuteRounding",
    "includedRevisions" INTEGER,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "videoType" "VideoType" NOT NULL,
    "defaultVideoCount" INTEGER NOT NULL DEFAULT 1,
    "defaultRatio" TEXT,
    "defaultFormat" TEXT,
    "defaultExpectedSec" INTEGER,
    "defaultIncludedRevisions" INTEGER,
    "defaultEstimatedHours" DECIMAL(8,2),
    "titlePattern" TEXT NOT NULL DEFAULT '{type} {n}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerId" TEXT,
    "description" TEXT,
    "startOn" DATE,
    "clientDeadline" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "driveUrl" TEXT,
    "otherLinks" TEXT,
    "includedRevisionRounds" INTEGER,
    "revisionRoundDefinition" TEXT,
    "productionErrorPolicy" TEXT,
    "templateId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "VideoType" NOT NULL,
    "format" TEXT,
    "ratio" TEXT,
    "language" TEXT,
    "rushDurationSec" INTEGER,
    "expectedDurationSec" INTEGER,
    "finalDurationSec" INTEGER,
    "brief" TEXT,
    "objectives" TEXT,
    "audience" TEXT,
    "references" TEXT,
    "subtitleStyle" TEXT,
    "brandConstraints" TEXT,
    "exportInstructions" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "plannedStartOn" DATE,
    "internalDeadline" DATE,
    "clientDeadline" DATE,
    "status" "VideoStatus" NOT NULL DEFAULT 'TO_PREPARE',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockedReason" TEXT,
    "blockedOwnerId" TEXT,
    "blockedAt" TIMESTAMP(3),
    "includedRevisionRounds" INTEGER,
    "estimatedHours" DECIMAL(8,2),
    "approvedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "deliveryOverrideReason" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoLink" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "kind" "LinkKind" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "editorVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoStatusEvent" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "fromStatus" "VideoStatus",
    "toStatus" "VideoStatus" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineChange" (
    "id" TEXT NOT NULL,
    "field" "DeadlineField" NOT NULL,
    "videoId" TEXT,
    "assignmentId" TEXT,
    "projectId" TEXT,
    "oldDate" DATE,
    "newDate" DATE,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL DEFAULT 'EDIT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "rateMode" "RateMode",
    "unitPrice" DECIMAL(18,2),
    "currency" "Currency",
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "minuteRounding" "MinuteRounding",
    "rateCardId" TEXT,
    "includedRevisions" INTEGER,
    "estimatedHours" DECIMAL(8,2),
    "startOn" DATE,
    "dueOn" DATE,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "internalValidatedById" TEXT,
    "internalValidatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoVersion" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "authorId" TEXT,
    "editorId" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'PENDING',
    "changesCategory" "FeedbackCategory",
    "changesSource" "FeedbackSource",
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "versionId" TEXT,
    "authorId" TEXT,
    "source" "FeedbackSource" NOT NULL DEFAULT 'INTERNAL',
    "visibleToEditor" BOOLEAN NOT NULL DEFAULT true,
    "timecode" TEXT,
    "body" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "category" "FeedbackCategory" NOT NULL DEFAULT 'INCLUDED',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoChecklistItem" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "VideoChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clientPrice" DECIMAL(18,2),
    "clientCurrency" "Currency",
    "editorCost" DECIMAL(18,2),
    "editorCurrency" "Currency",
    "editorId" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PROPOSED',
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "acceptanceNote" TEXT,
    "salesOrderLineId" TEXT,
    "directCostId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "editorId" TEXT,
    "assignmentId" TEXT,
    "videoId" TEXT,
    "workedOn" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "isOwnerTime" BOOLEAN NOT NULL DEFAULT false,
    "valuationRate" DECIMAL(18,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "videoType" "VideoType",
    "unit" TEXT NOT NULL DEFAULT 'vidéo',
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "includedRevisions" INTEGER,
    "turnaroundDays" INTEGER,
    "targetCost" DECIMAL(18,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPrice" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "acceptedOn" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'ACCEPTED',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "description" TEXT NOT NULL,
    "videoType" "VideoType",
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "netAmountEur" DECIMAL(18,2) NOT NULL,
    "cancelledAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cancelledAmountEur" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cancelledOn" DATE,
    "cancelReason" TEXT,
    "includedRevisions" INTEGER,
    "allocationMethod" "AllocationMethod" NOT NULL DEFAULT 'EQUAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueAllocation" (
    "id" TEXT NOT NULL,
    "salesOrderLineId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "weight" DECIMAL(12,4),
    "amount" DECIMAL(18,2) NOT NULL,
    "amountEur" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "externalRef" TEXT,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "salesOrderId" TEXT,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE,
    "dueDate" DATE,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "totalNet" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalNetEur" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "pdfAttachmentId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "salesOrderLineId" TEXT,
    "deductsInvoiceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "issueDate" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "totalNet" DECIMAL(18,2) NOT NULL,
    "totalVat" DECIMAL(18,2) NOT NULL,
    "totalGross" DECIMAL(18,2) NOT NULL,
    "totalNetEur" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "pdfAttachmentId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPayment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "amountEur" DECIMAL(18,2) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feesEur" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "proofAttachmentId" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reverseReason" TEXT,
    "reversedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRefund" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "paymentId" TEXT,
    "creditNoteId" TEXT,
    "refundedOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "amountEur" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "reason" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectCost" (
    "id" TEXT NOT NULL,
    "kind" "CostKind" NOT NULL,
    "stage" "CostStage" NOT NULL DEFAULT 'ESTIMATED',
    "label" TEXT NOT NULL,
    "editorId" TEXT,
    "supplierName" TEXT,
    "assignmentId" TEXT,
    "projectId" TEXT,
    "videoId" TEXT,
    "amount" DECIMAL(18,2),
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10),
    "fxRateDate" DATE,
    "fxSource" "FxSource",
    "amountEur" DECIMAL(18,2),
    "nonRecoverableVat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "incurredOn" DATE NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "committedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "attachmentId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DirectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostAllocation" (
    "id" TEXT NOT NULL,
    "directCostId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountEur" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL,
    "editorId" TEXT,
    "supplierName" TEXT,
    "paidOn" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "amountEur" DECIMAL(18,2) NOT NULL,
    "fees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feesEur" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "proofAttachmentId" TEXT,
    "notes" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "directCostId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountEurAtCost" DECIMAL(18,2) NOT NULL,
    "amountEurAtPayment" DECIMAL(18,2) NOT NULL,
    "fxDifferenceEur" DECIMAL(18,2) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reverseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "supplier" TEXT,
    "expenseDate" DATE NOT NULL,
    "periodMonth" DATE NOT NULL,
    "amountNet" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatRecoverable" BOOLEAN NOT NULL DEFAULT true,
    "currency" "Currency" NOT NULL,
    "fxUnitsPerEur" DECIMAL(20,10) NOT NULL,
    "fxRateDate" DATE NOT NULL,
    "fxSource" "FxSource" NOT NULL,
    "costEur" DECIMAL(18,2) NOT NULL,
    "grossEur" DECIMAL(18,2) NOT NULL,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'NONE',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidOn" DATE,
    "attachmentId" TEXT,
    "notes" TEXT,
    "status" "MovementStatus" NOT NULL DEFAULT 'RECORDED',
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retainer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "carryOver" "CarryOverPolicy" NOT NULL DEFAULT 'NONE',
    "status" "RetainerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createDraftInvoice" BOOLEAN NOT NULL DEFAULT true,
    "vatRate" DECIMAL(5,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerQuota" (
    "id" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "videoType" "VideoType" NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RetainerQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerPeriod" (
    "id" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "salesOrderId" TEXT,
    "invoiceId" TEXT,
    "credits" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerCreditUse" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "videoType" "VideoType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerCreditUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "ownerType" "AttachmentOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "legacySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyIdMap" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "legacyTable" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "importRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyIdMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyPayment" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "legacyStatus" TEXT NOT NULL,
    "quoteAmountRaw" INTEGER,
    "nextPaymentOn" DATE,
    "comment" TEXT,
    "reconciliationStatus" "ReconciliationStatus" NOT NULL DEFAULT 'TO_RECONCILE',
    "linkedInvoiceId" TEXT,
    "linkedPaymentId" TEXT,
    "qualifiedById" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "qualificationNote" TEXT,
    "originalData" JSONB NOT NULL,
    "legacyCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "level" "IssueLevel" NOT NULL,
    "table" TEXT NOT NULL,
    "legacyId" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AccessToken_tokenHash_key" ON "AccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccessToken_userId_purpose_idx" ON "AccessToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_currency_key" ON "ExchangeRate"("date", "currency");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_displayName_idx" ON "Client"("displayName");

-- CreateIndex
CREATE INDEX "Client_nextFollowUpOn_idx" ON "Client"("nextFollowUpOn");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "ClientContact_email_idx" ON "ClientContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_projectId_key" ON "Opportunity"("projectId");

-- CreateIndex
CREATE INDEX "Opportunity_stage_idx" ON "Opportunity"("stage");

-- CreateIndex
CREATE INDEX "Opportunity_followUpOn_idx" ON "Opportunity"("followUpOn");

-- CreateIndex
CREATE INDEX "Opportunity_clientId_idx" ON "Opportunity"("clientId");

-- CreateIndex
CREATE INDEX "Activity_clientId_occurredAt_idx" ON "Activity"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_opportunityId_idx" ON "Activity"("opportunityId");

-- CreateIndex
CREATE INDEX "Note_clientId_createdAt_idx" ON "Note"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_projectId_idx" ON "Note"("projectId");

-- CreateIndex
CREATE INDEX "Note_videoId_idx" ON "Note"("videoId");

-- CreateIndex
CREATE INDEX "Note_editorId_idx" ON "Note"("editorId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorProfile_userId_key" ON "EditorProfile"("userId");

-- CreateIndex
CREATE INDEX "EditorProfile_status_idx" ON "EditorProfile"("status");

-- CreateIndex
CREATE INDEX "EditorUnavailability_editorId_startsOn_idx" ON "EditorUnavailability"("editorId", "startsOn");

-- CreateIndex
CREATE INDEX "RateCard_editorId_active_idx" ON "RateCard"("editorId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTemplate_name_key" ON "ProjectTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_reference_key" ON "Project"("reference");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_clientDeadline_idx" ON "Project"("clientDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "Video_reference_key" ON "Video"("reference");

-- CreateIndex
CREATE INDEX "Video_projectId_idx" ON "Video"("projectId");

-- CreateIndex
CREATE INDEX "Video_status_idx" ON "Video"("status");

-- CreateIndex
CREATE INDEX "Video_clientDeadline_idx" ON "Video"("clientDeadline");

-- CreateIndex
CREATE INDEX "Video_internalDeadline_idx" ON "Video"("internalDeadline");

-- CreateIndex
CREATE INDEX "VideoLink_videoId_idx" ON "VideoLink"("videoId");

-- CreateIndex
CREATE INDEX "VideoStatusEvent_videoId_createdAt_idx" ON "VideoStatusEvent"("videoId", "createdAt");

-- CreateIndex
CREATE INDEX "DeadlineChange_videoId_idx" ON "DeadlineChange"("videoId");

-- CreateIndex
CREATE INDEX "Assignment_videoId_idx" ON "Assignment"("videoId");

-- CreateIndex
CREATE INDEX "Assignment_editorId_status_idx" ON "Assignment"("editorId", "status");

-- CreateIndex
CREATE INDEX "Assignment_dueOn_idx" ON "Assignment"("dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "VideoVersion_videoId_number_key" ON "VideoVersion"("videoId", "number");

-- CreateIndex
CREATE INDEX "Feedback_videoId_status_idx" ON "Feedback"("videoId", "status");

-- CreateIndex
CREATE INDEX "VideoChecklistItem_videoId_idx" ON "VideoChecklistItem"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_salesOrderLineId_key" ON "ChangeRequest"("salesOrderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_directCostId_key" ON "ChangeRequest"("directCostId");

-- CreateIndex
CREATE INDEX "ChangeRequest_videoId_idx" ON "ChangeRequest"("videoId");

-- CreateIndex
CREATE INDEX "TimeEntry_workedOn_idx" ON "TimeEntry"("workedOn");

-- CreateIndex
CREATE INDEX "TimeEntry_videoId_idx" ON "TimeEntry"("videoId");

-- CreateIndex
CREATE INDEX "ClientPrice_clientId_idx" ON "ClientPrice"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_reference_key" ON "SalesOrder"("reference");

-- CreateIndex
CREATE INDEX "SalesOrder_clientId_idx" ON "SalesOrder"("clientId");

-- CreateIndex
CREATE INDEX "SalesOrder_acceptedOn_idx" ON "SalesOrder"("acceptedOn");

-- CreateIndex
CREATE INDEX "SalesOrderLine_salesOrderId_idx" ON "SalesOrderLine"("salesOrderId");

-- CreateIndex
CREATE INDEX "RevenueAllocation_videoId_idx" ON "RevenueAllocation"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueAllocation_salesOrderLineId_videoId_key" ON "RevenueAllocation"("salesOrderLineId", "videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_status_issueDate_idx" ON "Invoice"("status", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_deductsInvoiceId_idx" ON "InvoiceLine"("deductsInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_issueDate_idx" ON "CreditNote"("issueDate");

-- CreateIndex
CREATE INDEX "ClientPayment_clientId_idx" ON "ClientPayment"("clientId");

-- CreateIndex
CREATE INDEX "ClientPayment_receivedOn_idx" ON "ClientPayment"("receivedOn");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "ClientRefund_refundedOn_idx" ON "ClientRefund"("refundedOn");

-- CreateIndex
CREATE INDEX "DirectCost_editorId_stage_idx" ON "DirectCost"("editorId", "stage");

-- CreateIndex
CREATE INDEX "DirectCost_videoId_idx" ON "DirectCost"("videoId");

-- CreateIndex
CREATE INDEX "DirectCost_projectId_idx" ON "DirectCost"("projectId");

-- CreateIndex
CREATE INDEX "DirectCost_assignmentId_idx" ON "DirectCost"("assignmentId");

-- CreateIndex
CREATE INDEX "DirectCost_incurredOn_idx" ON "DirectCost"("incurredOn");

-- CreateIndex
CREATE INDEX "CostAllocation_videoId_idx" ON "CostAllocation"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "CostAllocation_directCostId_videoId_key" ON "CostAllocation"("directCostId", "videoId");

-- CreateIndex
CREATE INDEX "SupplierPayment_editorId_idx" ON "SupplierPayment"("editorId");

-- CreateIndex
CREATE INDEX "SupplierPayment_paidOn_idx" ON "SupplierPayment"("paidOn");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_paymentId_idx" ON "SupplierPaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "SupplierPaymentAllocation_directCostId_idx" ON "SupplierPaymentAllocation"("directCostId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "Expense_periodMonth_idx" ON "Expense"("periodMonth");

-- CreateIndex
CREATE INDEX "Expense_paidOn_idx" ON "Expense"("paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "RetainerQuota_retainerId_videoType_key" ON "RetainerQuota"("retainerId", "videoType");

-- CreateIndex
CREATE UNIQUE INDEX "RetainerPeriod_salesOrderId_key" ON "RetainerPeriod"("salesOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RetainerPeriod_invoiceId_key" ON "RetainerPeriod"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "RetainerPeriod_retainerId_periodStart_key" ON "RetainerPeriod"("retainerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "RetainerCreditUse_videoId_key" ON "RetainerCreditUse"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_ownerType_ownerId_idx" ON "Attachment"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "JobLog_name_startedAt_idx" ON "JobLog"("name", "startedAt");

-- CreateIndex
CREATE INDEX "LegacyIdMap_entityType_entityId_idx" ON "LegacyIdMap"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyIdMap_source_legacyTable_legacyId_key" ON "LegacyIdMap"("source", "legacyTable", "legacyId");

-- CreateIndex
CREATE INDEX "LegacyPayment_reconciliationStatus_idx" ON "LegacyPayment"("reconciliationStatus");

-- CreateIndex
CREATE INDEX "ImportIssue_runId_level_idx" ON "ImportIssue"("runId", "level");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessToken" ADD CONSTRAINT "AccessToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorProfile" ADD CONSTRAINT "EditorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorUnavailability" ADD CONSTRAINT "EditorUnavailability_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoLink" ADD CONSTRAINT "VideoLink_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoStatusEvent" ADD CONSTRAINT "VideoStatusEvent_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "RateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoVersion" ADD CONSTRAINT "VideoVersion_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoVersion" ADD CONSTRAINT "VideoVersion_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VideoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoChecklistItem" ADD CONSTRAINT "VideoChecklistItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_directCostId_fkey" FOREIGN KEY ("directCostId") REFERENCES "DirectCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPrice" ADD CONSTRAINT "ClientPrice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPrice" ADD CONSTRAINT "ClientPrice_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_salesOrderLineId_fkey" FOREIGN KEY ("salesOrderLineId") REFERENCES "SalesOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_deductsInvoiceId_fkey" FOREIGN KEY ("deductsInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ClientPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRefund" ADD CONSTRAINT "ClientRefund_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRefund" ADD CONSTRAINT "ClientRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ClientPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRefund" ADD CONSTRAINT "ClientRefund_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_directCostId_fkey" FOREIGN KEY ("directCostId") REFERENCES "DirectCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "EditorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_directCostId_fkey" FOREIGN KEY ("directCostId") REFERENCES "DirectCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerQuota" ADD CONSTRAINT "RetainerQuota_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerPeriod" ADD CONSTRAINT "RetainerPeriod_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerPeriod" ADD CONSTRAINT "RetainerPeriod_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerPeriod" ADD CONSTRAINT "RetainerPeriod_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerCreditUse" ADD CONSTRAINT "RetainerCreditUse_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "RetainerPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerCreditUse" ADD CONSTRAINT "RetainerCreditUse_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_linkedInvoiceId_fkey" FOREIGN KEY ("linkedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_linkedPaymentId_fkey" FOREIGN KEY ("linkedPaymentId") REFERENCES "ClientPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Contraintes métier complémentaires (non modélisées par Prisma).
-- Prisma ne gère pas les CHECK : elles sont conservées par les migrations suivantes.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "AgencySettings" ADD CONSTRAINT "AgencySettings_singleton" CHECK ("id" = 1);
ALTER TABLE "AgencySettings" ADD CONSTRAINT "AgencySettings_threshold_pct" CHECK ("marginThresholdPct" >= 0 AND "marginThresholdPct" <= 100);
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_positive" CHECK ("unitsPerEur" > 0);
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_probability_pct" CHECK ("probability" IS NULL OR ("probability" >= 0 AND "probability" <= 100));
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_amount_positive" CHECK ("estimatedAmount" IS NULL OR "estimatedAmount" >= 0);
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_price_positive" CHECK ("unitPrice" >= 0);
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_qty_positive" CHECK ("quantity" > 0);
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_price_positive" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0);
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_minutes_positive" CHECK ("minutes" > 0);
ALTER TABLE "Video" ADD CONSTRAINT "Video_durations_positive" CHECK (
  ("rushDurationSec" IS NULL OR "rushDurationSec" >= 0) AND
  ("expectedDurationSec" IS NULL OR "expectedDurationSec" >= 0) AND
  ("finalDurationSec" IS NULL OR "finalDurationSec" >= 0));

ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_fx_positive" CHECK ("fxUnitsPerEur" > 0);
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_amounts" CHECK (
  "quantity" > 0 AND "unitPrice" >= 0 AND "discountAmount" >= 0 AND "netAmount" >= 0
  AND "cancelledAmount" >= 0 AND "cancelledAmount" <= "netAmount");
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_positive" CHECK ("amount" >= 0);

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_fx_positive" CHECK ("fxUnitsPerEur" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issued_has_date" CHECK ("status" <> 'ISSUED' OR "issueDate" IS NOT NULL);
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_vat_pct" CHECK ("vatRate" >= 0 AND "vatRate" <= 100);
-- Seules les lignes de déduction d'acompte peuvent être négatives.
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_sign" CHECK ("netAmount" >= 0 OR "deductsInvoiceId" IS NOT NULL);
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_positive" CHECK ("totalNet" > 0 AND "totalGross" > 0 AND "totalVat" >= 0 AND "fxUnitsPerEur" > 0);

ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_positive" CHECK ("amount" > 0 AND "fees" >= 0 AND "fxUnitsPerEur" > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_positive" CHECK ("amount" > 0);
ALTER TABLE "ClientRefund" ADD CONSTRAINT "ClientRefund_positive" CHECK ("amount" > 0 AND "fxUnitsPerEur" > 0);

ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_amount" CHECK ("amount" IS NULL OR "amount" >= 0);
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_fx" CHECK ("fxUnitsPerEur" IS NULL OR "fxUnitsPerEur" > 0);
ALTER TABLE "DirectCost" ADD CONSTRAINT "DirectCost_amount_eur_consistent" CHECK (("amount" IS NULL) = ("amountEur" IS NULL));
ALTER TABLE "CostAllocation" ADD CONSTRAINT "CostAllocation_positive" CHECK ("amount" >= 0);
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_positive" CHECK ("amount" > 0 AND "fees" >= 0 AND "fxUnitsPerEur" > 0);
ALTER TABLE "SupplierPaymentAllocation" ADD CONSTRAINT "SupplierPaymentAllocation_positive" CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amounts" CHECK ("amountNet" >= 0 AND "vatAmount" >= 0 AND "fxUnitsPerEur" > 0);
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_amount" CHECK ("amount" >= 0);
ALTER TABLE "RetainerQuota" ADD CONSTRAINT "RetainerQuota_qty" CHECK ("quantity" >= 0);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size" CHECK ("byteSize" >= 0);
