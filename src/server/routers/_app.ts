import { router } from '../trpc'
import { agreementsRouter } from './agreements'
import { dashboardRouter } from './dashboard'
import { auditLogsRouter } from './auditLogs'
import { authRouter } from './auth'
import { chatRouter } from './chat'
import { consentRouter } from './consent'
import { dataCatalogRouter } from './dataCatalog'
import { dataRequestsRouter } from './dataRequests'
import { decisionsRouter } from './decisions'
import { documentsRouter } from './documents'
import { establishmentPersonnelRouter } from './establishmentPersonnel'
import { eventsRouter } from './events'
import { facilitiesRouter } from './facilities'
import { feesRouter } from './fees'
import { financeRouter } from './finance'
import { groupsRouter } from './groups'
import { instituteProfileRouter } from './instituteProfile'
import { kpisRouter } from './kpis'
import { legalBasisRouter } from './legalBasis'
import { meetingsRouter } from './meetings'
import { memberAgreementsRouter } from './memberAgreements'
import { membersRouter } from './members'
import { notificationsRouter } from './notifications'
import { partnersRouter } from './partners'
import { premisesRouter } from './premises'
import { productsRouter } from './products'
import { projectsRouter } from './projects'
import { registrationDossierRouter } from './registrationDossier'
import { reportsRouter } from './reports'
import { retentionRulesRouter } from './retentionRules'
import { submissionsRouter } from './submissions'
import { tasksRouter } from './tasks'
import { tiersRouter } from './tiers'
import { usersRouter } from './users'

/**
 * Root app router — all sub-routers are merged here.
 * Add new module routers as they are implemented.
 */
export const appRouter = router({
  agreements: agreementsRouter,
  auditLogs: auditLogsRouter,
  auth: authRouter,
  chat: chatRouter,
  consent: consentRouter,
  dashboard: dashboardRouter,
  dataCatalog: dataCatalogRouter,
  dataRequests: dataRequestsRouter,
  decisions: decisionsRouter,
  documents: documentsRouter,
  establishmentPersonnel: establishmentPersonnelRouter,
  events: eventsRouter,
  facilities: facilitiesRouter,
  fees: feesRouter,
  finance: financeRouter,
  groups: groupsRouter,
  instituteProfile: instituteProfileRouter,
  kpis: kpisRouter,
  legalBasis: legalBasisRouter,
  meetings: meetingsRouter,
  memberAgreements: memberAgreementsRouter,
  members: membersRouter,
  notifications: notificationsRouter,
  partners: partnersRouter,
  premises: premisesRouter,
  products: productsRouter,
  projects: projectsRouter,
  registrationDossier: registrationDossierRouter,
  reports: reportsRouter,
  retentionRules: retentionRulesRouter,
  submissions: submissionsRouter,
  tasks: tasksRouter,
  tiers: tiersRouter,
  users: usersRouter,
})

export type AppRouter = typeof appRouter
